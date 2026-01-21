// // models/stuedntExam.modal.js
// import mongoose from "mongoose";

// const AnswerSubSchema = new mongoose.Schema(
//   {
//     questionId: { type: mongoose.Schema.Types.ObjectId, ref: "QuestionPapers", required: true },
//     answer: {
//       type: mongoose.Schema.Types.Mixed,
//       required: false,
//     },
//     isCorrect: { type: Boolean, default: null },

//     lastSavedAt: { type: Date },

//     attempts: [
//       {
//         attemptNumber: Number,
//         summary: { passedCount: Number, totalCount: Number, score: Number },
//         submittedAt: Date,
//       },
//     ],
//   },
//   { _id: false } 
// );

// const studentExamSchema = new mongoose.Schema(
//   {
//     student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//     exam: { type: mongoose.Schema.Types.ObjectId, ref: "PaperTemplate", required: true },
//     answers: {
//       type: [AnswerSubSchema],
//       default: [],
//     },

//     status: {
//       type: String,
//       enum: ["IN_PROGRESS", "SUBMITTED", "EVALUATED"],
//       default: "IN_PROGRESS",
//     },
//     score: { type: Number, default: 0 },
//     startedAt: { type: Date, default: Date.now },
//     submittedAt: { type: Date },
//   },
//   { timestamps: true }
// );

// export default mongoose.model("StudentExam", studentExamSchema);

import mongoose from "mongoose";

const AnswerSubSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "QuestionPapers", required: true },
    answer: { type: mongoose.Schema.Types.Mixed, required: false },
    isCorrect: { type: Boolean, default: null },
    lastSavedAt: { type: Date },
    attempts: [
      {
        attemptNumber: Number,
        summary: { passedCount: Number, totalCount: Number, score: Number },
        submittedAt: Date,
      },
    ],
  },
  { _id: false }
);

const studentExamSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "PaperTemplate", required: true },

    // ✅ add these two fields
    email: { type: String, index: true },
    rollNumber: { type: String, index: true },

    answers: {
      type: [AnswerSubSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["IN_PROGRESS", "SUBMITTED", "EVALUATED"],
      default: "IN_PROGRESS",
    },

    score: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

/* ✅ Unique Constraints */

// A student with same email cannot retake the SAME exam
studentExamSchema.index(
  { exam: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

// A student with same rollNumber cannot retake the SAME exam
studentExamSchema.index(
  { exam: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { rollNumber: { $type: "string" } } }
);

// You may also keep a simple index on exam for faster lookups
studentExamSchema.index({ exam: 1, student: 1 });

export default mongoose.model("StudentExam", studentExamSchema);
