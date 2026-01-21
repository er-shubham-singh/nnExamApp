import mongoose from "mongoose";

const SubmissionSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    email: { type: String, index: true },
    rollNumber: { type: String, index: true },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED", "CANCELLED"],
      default: "IN_PROGRESS",
      index: true,
    },
    answers: { type: Object, default: {} },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

// ✅ Enforce: one attempt per (exam,email) if email exists
SubmissionSchema.index(
  { exam: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

// ✅ Enforce: one attempt per (exam,rollNumber) if rollNumber exists
SubmissionSchema.index(
  { exam: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { rollNumber: { $type: "string" } } }
);

export default mongoose.model("Submission", SubmissionSchema);
