import mongoose from "mongoose";

const tutorReviewSchema = new mongoose.Schema(
{
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeacherProfile",
    required: true,
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  demo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DemoClass",
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: Number.isInteger
  },
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 100,
  },
  feedback: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 2000,
  },
  tutorReply: {
    text: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    repliedAt: Date,
  },
 },
  {timnestamps: true}
);

tutorReviewSchema.index({student: 1, tutor: 1}, {uniue: true});

export default mongoose.model("TutorReview", tutorReviewSchema);