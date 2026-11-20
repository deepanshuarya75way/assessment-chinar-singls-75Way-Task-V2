const router = require("express").Router();
const {
  getTutorReviews,
  getReviewEligibility,
  createTutorReview,
  replyToTutorResponse,
  confirmDemoAttendence,
} = require("../controllers/reviewController.js");
const { streamReviewEvents } = require("../utils/reviewEvents.js");
const { protect } = require("../middleware/auth.js");

const safe = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

router.get("/events", streamReviewEvents);
router.get("/tutors/:tutorId", safe(getTutorReviews));
router.get("/eligibility/:demoId/:tutorId", protect, safe(getReviewEligibility));
router.post("/", protect, safe(createTutorReview));
router.patch("/demos/:demoId/confirm-attendance", protect, safe(confirmDemoAttendence));
router.patch("/:reviewId/reply", protect, safe(replyToTutorResponse));

module.exports = router;