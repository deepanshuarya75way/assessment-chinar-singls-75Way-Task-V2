import mongoose from "mongoose";
import DemoClass from "../models/DemoClass.js";
import TeacherProfile from "../models/TeacherProfile.js";
import TutorReview from "../models/TutorReview.js";
import { broadcastReviewUpdated } from "../utils/reviewEvents.js";

const idOf = (value) => {
  if (!value) return "";
  if (typeof value === "object") {
    return String(value._id ?? value.id ?? value);
  }
  return String(value);
};

const currentUserId = (req) =>
  idOf(req.user?._id ?? req.user?.id ?? req.user?.userId);

const tutorOwnerId = (tutor) =>
  idOf(tutor?.user ?? tutor?.userId ?? tutor?.owner);

const demoStudentIds = (demo) =>
  [
    demo?.student,
    demo?.studentId,
    demo?.parent,
    demo?.parentId,
    demo?.bookedBy,
    demo?.user,
  ]
    .map(idOf)
    .filter(Boolean);

const demoTutorIds = (demo) =>
  [
    demo?.teacher,
    demo?.tutor,
    demo?.teacherId,
    demo?.tutorId,
    demo?.tutorProfile,
    demo?.teacherProfile,
  ]
    .map(idOf)
    .filter(Boolean);

function isDemoForTutor(demo, tutor) {
  const allowedIds = [idOf(tutor?._id), tutorOwnerId(tutor)].filter(Boolean);
  return demoTutorIds(demo).some((id) => allowedIds.includes(id));
}

function isCompleted(demo) {
  return String(demo?.status ?? "").toLowerCase() === "completed";
}

function isAttendanceConfirmed(demo) {
  return Boolean(demo?.attendanceConfirmed ?? demo?.attendanceComfirmed);
}

function validId(id, res) {
  if (mongoose.isValidObjectId(id)) return true;

  res.status(400).json({
    message: "Invalid Identifier",
  });
  return false;
}

function isStudent(req) {
  const role = String(req.user?.role ?? "").toLowerCase();
  return ["student", "parent"].includes(role);
}

function isTutorOrAdmin(req) {
  const role = String(req.user?.role ?? "").toLowerCase();
  return ["teacher", "tutor", "admin"].includes(role);
}

/**
 * Recomputes and persists rating summary directly from MongoDB TutorReview documents
 * so MongoDB remains the single source of truth.
 */
async function recalculateTutorRating(tutorId, session = null) {
  const objectId = new mongoose.Types.ObjectId(String(tutorId));

  const aggregatePipeline = [
    { $match: { tutor: objectId, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: "$tutor",
        avgRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ];

  const query = TutorReview.aggregate(aggregatePipeline);
  if (session) query.session(session);
  const stats = await query;

  const avgRating =
    stats.length > 0 ? Number(stats[0].avgRating.toFixed(2)) : 0;
  const reviewCount = stats.length > 0 ? stats[0].reviewCount : 0;

  await TeacherProfile.findByIdAndUpdate(
    tutorId,
    {
      $set: {
        rating: avgRating,
        averageRating: avgRating,
        reviewCount,
        totalReviews: reviewCount,
      },
    },
    { session }
  );

  return { avgRating, reviewCount };
}

async function checkEligibility(demo, tutor, studentId) {
  if (!demo || !tutor) {
    return { eligible: false, alreadyReviewed: false, reason: "Demo or tutor not found" };
  }

  if (!demoStudentIds(demo).includes(studentId)) {
    return { eligible: false, alreadyReviewed: false, reason: "This demo does not belong to you" };
  }

  if (!isDemoForTutor(demo, tutor)) {
    return { eligible: false, alreadyReviewed: false, reason: "Tutor is not assigned to this demo" };
  }

  if (!isCompleted(demo)) {
    return { eligible: false, alreadyReviewed: false, reason: "Demo is not completed" };
  }

  if (!isAttendanceConfirmed(demo)) {
    return { eligible: false, alreadyReviewed: false, reason: "Attendance has not been confirmed" };
  }

  const existing = await TutorReview.exists({
    student: studentId,
    tutor: tutor._id,
    isDeleted: { $ne: true },
  });

  if (existing) {
    return {
      eligible: false,
      alreadyReviewed: true,
      reason: "You have already reviewed this tutor",
    };
  }

  return {
    eligible: true,
    alreadyReviewed: false,
  };
}

export async function getReviewEligibility(req, res) {
  try {
    if (!isStudent(req)) {
      return res.status(403).json({ message: "Student account required" });
    }

    const studentId = currentUserId(req);
    const { demoId, tutorId } = req.params;

    if (!validId(demoId, res) || !validId(tutorId, res)) {
      return;
    }

    const [demo, tutor] = await Promise.all([
      DemoClass.findById(demoId),
      TeacherProfile.findById(tutorId),
    ]);

    if (!demo || !tutor) {
      return res.status(404).json({ message: "Demo or tutor not found" });
    }

    const result = await checkEligibility(demo, tutor, studentId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("getReviewEligibility error:", error);
    return res.status(500).json({ message: "Failed to check review eligibility" });
  }
}

export async function createTutorReview(req, res) {
  const session = await mongoose.startSession();
  try {
    if (!isStudent(req)) {
      return res.status(403).json({ message: "Student account required" });
    }

    const studentId = currentUserId(req);
    const demoId = req.body.demoId ?? req.params.demoId;
    const tutorId = req.body.tutorId ?? req.params.tutorId;
    const rating = Number(req.body.rating);
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";

    if (!validId(demoId, res) || !validId(tutorId, res)) {
      return;
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be a number between 1 and 5" });
    }

    const [demo, tutor] = await Promise.all([
      DemoClass.findById(demoId),
      TeacherProfile.findById(tutorId),
    ]);

    if (!demo || !tutor) {
      return res.status(404).json({ message: "Demo or tutor not found" });
    }

    const eligibility = await checkEligibility(demo, tutor, studentId);
    if (!eligibility.eligible) {
      return res.status(403).json({
        message: eligibility.reason,
        alreadyReviewed: Boolean(eligibility.alreadyReviewed),
      });
    }

    let createdReview;
    let ratingSummary;

    await session.withTransaction(async () => {
      const [review] = await TutorReview.create(
        [
          {
            demo: demo._id,
            tutor: tutor._id,
            student: studentId,
            rating,
            comment,
          },
        ],
        { session }
      );

      createdReview = review;
      ratingSummary = await recalculateTutorRating(tutor._id, session);
    });

    const populatedReview = await TutorReview.findById(createdReview._id)
      .populate("student", "name avatar")
      .lean();

    if (typeof broadcastReviewUpdated === "function") {
      broadcastReviewUpdated({
        tutorId: String(tutor._id),
        review: populatedReview,
        ...ratingSummary,
      });
    }

    return res.status(201).json({
      message: "Review submitted successfully",
      review: populatedReview,
      ...ratingSummary,
    });
  } catch (error) {
    // Handle MongoDB unique index race condition (e.g., duplicate student + tutor)
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "You have already reviewed this tutor",
        alreadyReviewed: true,
      });
    }
    console.error("createTutorReview error:", error);
    return res.status(500).json({ message: "Failed to create review" });
  } finally {
    await session.endSession();
  }
}

export async function getTutorReviews(req, res) {
  try {
    const { tutorId } = req.params;
    if (!validId(tutorId, res)) {
      return;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const tutor = await TeacherProfile.findById(tutorId).lean();
    if (!tutor) {
      return res.status(404).json({ message: "Tutor not found" });
    }

    const filter = { tutor: tutor._id, isDeleted: { $ne: true } };

    const [reviews, total, breakdownAgg] = await Promise.all([
      TutorReview.find(filter)
        .populate("student", "name avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TutorReview.countDocuments(filter),
      TutorReview.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let weightedSum = 0;

    for (const bucket of breakdownAgg) {
      const star = Number(bucket._id);
      if (ratingBreakdown[star] !== undefined) {
        ratingBreakdown[star] = bucket.count;
        weightedSum += star * bucket.count;
      }
    }

    const avgRating =
      total > 0 ? Number((weightedSum / total).toFixed(2)) : 0;

    return res.status(200).json({
      tutorId: String(tutor._id),
      avgRating,
      reviewCount: total,
      ratingBreakdown,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      reviews,
    });
  } catch (error) {
    console.error("getTutorReviews error:", error);
    return res.status(500).json({ message: "Failed to fetch tutor reviews" });
  }
}

export async function replyToTutorResponse(req, res) {
  try {
    if (!isTutorOrAdmin(req)) {
      return res.status(403).json({ message: "Only the assigned tutor or admin can reply" });
    }

    const { reviewId } = req.params;
    if (!validId(reviewId, res)) {
      return;
    }

    const replyText =
      typeof req.body.reply === "string"
        ? req.body.reply.trim()
        : typeof req.body.response === "string"
          ? req.body.response.trim()
          : "";

    if (!replyText) {
      return res.status(400).json({ message: "Reply text is required" });
    }

    const review = await TutorReview.findOne({ _id: reviewId, isDeleted: { $ne: true } });
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const tutor = await TeacherProfile.findById(review.tutor);
    const userId = currentUserId(req);
    const role = String(req.user?.role ?? "").toLowerCase();

    const isOwnerTutor = tutor && tutorOwnerId(tutor) === userId;
    if (role !== "admin" && !isOwnerTutor) {
      return res.status(403).json({ message: "You are not authorized to reply to this review" });
    }

    review.tutorReply = {
      text: replyText,
      repliedBy: userId || undefined,
      repliedAt: new Date(),
    };

    await review.save();

    const updatedReview = await TutorReview.findById(review._id)
      .populate("student", "name avatar")
      .lean();

    if (typeof broadcastReviewUpdated === "function") {
      broadcastReviewUpdated({
        tutorId: String(review.tutor),
        review: updatedReview,
      });
    }

    return res.status(200).json({
      message: "Reply saved successfully",
      review: updatedReview,
    });
  } catch (error) {
    console.error("replyToTutorResponse error:", error);
    return res.status(500).json({ message: "Failed to save reply" });
  }
}

export async function confirmDemoAttendence(req, res) {
  try {
    const { demoId } = req.params;
    if (!validId(demoId, res)) {
      return;
    }

    const demo = await DemoClass.findById(demoId);
    if (!demo) {
      return res.status(404).json({ message: "Demo class not found" });
    }

    const userId = currentUserId(req);
    const role = String(req.user?.role ?? "").toLowerCase();

    const isParticipant = demoStudentIds(demo).includes(userId);
    let isAssignedTutor = false;

    const tutorIds = demoTutorIds(demo);
    if (tutorIds.length > 0) {
      const tutors = await TeacherProfile.find({ _id: { $in: tutorIds } }).lean();
      isAssignedTutor = tutors.some(
        (t) => idOf(t._id) === userId || tutorOwnerId(t) === userId
      );
    }

    if (role !== "admin" && !isParticipant && !isAssignedTutor) {
      return res.status(403).json({
        message: "You are not authorized to confirm attendance for this demo",
      });
    }

    // Only allow confirming attendance once the demo is completed
    if (!isCompleted(demo)) {
      return res.status(400).json({
        message: "Attendance can only be confirmed after the demo is completed",
      });
    }

    demo.attendanceConfirmed = true;
    demo.attendanceConfirmedAt = new Date();
    demo.attendanceConfirmedBy = userId || undefined;
    if (typeof req.body?.attended === "boolean") {
      demo.attended = req.body.attended;
    }

    await demo.save();

    return res.status(200).json({
      message: "Demo attendance confirmed",
      demo: {
        _id: demo._id,
        status: demo.status,
        attendanceConfirmed: demo.attendanceConfirmed,
        attendanceConfirmedAt: demo.attendanceConfirmedAt,
      },
    });
  } catch (error) {
    console.error("confirmDemoAttendence error:", error);
    return res.status(500).json({ message: "Failed to confirm demo attendance" });
  }
}