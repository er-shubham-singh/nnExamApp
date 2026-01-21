// services/exam.service.js
import CodingAttempt from "../Modal/codingAttempt.model.js";
import "../Modal/exam.modal.js"; // ensure model is registered for populate()

import ExamLog from "../Modal/examLog.modal.js";
import QuestionPaper from "../Modal/question.model.js";
import StudentExam from "../Modal/stuedntExam.modal.js";
import { runStudentCode } from "./coding.service.js";
import { evaluateExam } from "./evaluationResult.service.js";

// ---------------- STUDENT ACTIONS ----------------

// Start Exam
// export const startExamService = async ({ student, exam }) => {
//   let studentExam = await StudentExam.findOne({
//     student,
//     exam,
//     status: "IN_PROGRESS",
//   });

//   if (!studentExam) {
//     studentExam = await StudentExam.create({
//       student,
//       exam,
//       status: "IN_PROGRESS",
//       answers: [],
//     });

//     await ExamLog.create({
//       studentExam: studentExam._id,
//       eventType: "JOIN_EXAM",
//       details: { student },
//     });
//   }

//   return studentExam;
// };

export const startExamService = async ({ student, exam, email, rollNumber }) => {
  // 1) Same exam + (email OR roll) ⇒ resume if unfinished, block if submitted
  if (email || rollNumber) {
    const existingByIdentity = await StudentExam.findOne({
      exam,
      $or: [
        ...(email ? [{ email }] : []),
        ...(rollNumber ? [{ rollNumber }] : []),
      ],
    });

    if (existingByIdentity) {
      if (existingByIdentity.status !== "SUBMITTED") {
        // backfill identity if newly provided
        let patch = false;
        if (email && !existingByIdentity.email) { existingByIdentity.email = email; patch = true; }
        if (rollNumber && !existingByIdentity.rollNumber) { existingByIdentity.rollNumber = rollNumber; patch = true; }
        if (patch) await existingByIdentity.save();
        return existingByIdentity; // ✅ resume
      }
      // ❌ already completed this exam with same email/roll
      const err = new Error("You have already completed this exam with this email/roll number.");
      err.code = "ALREADY_REGISTERED";
      throw err;
    }
  }

  // 2) Fallback: same student + exam in progress ⇒ resume
  const existingInProgress = await StudentExam.findOne({
    student,
    exam,
    status: "IN_PROGRESS",
  });

  if (existingInProgress) {
    let patch = false;
    if (email && !existingInProgress.email) { existingInProgress.email = email; patch = true; }
    if (rollNumber && !existingInProgress.rollNumber) { existingInProgress.rollNumber = rollNumber; patch = true; }
    if (patch) await existingInProgress.save();
    return existingInProgress; // ✅ resume
  }

  // 3) Create a new attempt (race-safe with unique indexes)
  try {
    const studentExam = await StudentExam.create({
      student,
      exam,
      email: email || undefined,
      rollNumber: rollNumber || undefined,
      status: "IN_PROGRESS",
      answers: [],
      startedAt: new Date(),
    });

    await ExamLog.create({
      studentExam: studentExam._id,
      eventType: "JOIN_EXAM",
      details: { student, email, rollNumber },
    });

    return studentExam; // ✅ fresh start
  } catch (e) {
    // Another tab/device created it milliseconds earlier → fetch & decide
    if (e?.code === 11000) {
      const dupe = await StudentExam.findOne({
        exam,
        $or: [
          ...(email ? [{ email }] : []),
          ...(rollNumber ? [{ rollNumber }] : []),
        ],
      });
      if (dupe && dupe.status !== "SUBMITTED") return dupe; // ✅ resume
      const err = new Error("You have already completed this exam with this email/roll number.");
      err.code = "ALREADY_REGISTERED";
      throw err;
    }
    throw e;
  }
};


// Update Answer (overwrite if exists)
export const updateAnswerService = async ({ studentExamId, questionId, answer }) => {
  const question = await QuestionPaper.findById(questionId).lean();
  if (!question) throw new Error("Question not found.");

  if (question.type === "CODING") {
    const { runType = "save", code = "", language, stdin = "" } = answer || {};
    const studentExam = await StudentExam.findById(studentExamId);
    if (!studentExam) throw new Error("StudentExam not found.");

    const existing = (studentExam.answers || []).find(
      (a) => String(a.questionId) === String(questionId)
    );
    if (existing) {
      existing.answer = { code, language, lastSavedAt: new Date() };
    } else {
      studentExam.answers.push({
        questionId,
        answer: { code, language, lastSavedAt: new Date() },
      });
    }
    await studentExam.save();

    // log the save event
    await ExamLog.create({
      studentExam: studentExamId,
      eventType: "ANSWER_UPDATE",
      details: { questionId, saved: true },
    });

    if (runType === "run") {
      const maxAttempts = (question.coding && question.coding.maxRunAttempts)
        ? Number(question.coding.maxRunAttempts)
        : 3;

      const runResp = await runStudentCode({
        studentExamId,
        questionId,
        code,
        language: language || question.coding?.defaultLanguage || "javascript",
        stdin: stdin || "",
        maxAttempts,
        timeLimitMs: question.coding?.timeLimitMs || 2000,
        runBy: studentExam.student,
      });

      return runResp;
    }

    return { ok: true, saved: true };
  }

  const updatedExam = await StudentExam.findOneAndUpdate(
    { _id: studentExamId, "answers.questionId": questionId },
    { $set: { "answers.$.answer": answer } }, // update if exists
    { new: true }
  );
  if (!updatedExam) {
    await StudentExam.findByIdAndUpdate(studentExamId, {
      $push: { answers: { questionId, answer } },
    });
  }

  await ExamLog.create({
    studentExam: studentExamId,
    eventType: "ANSWER_UPDATE",
    details: { questionId, answer },
  });

  return { ok: true };
};


// Submit Exam

export const submitExamService = async ({ studentExamId }) => {
  const submittedExam = await StudentExam.findByIdAndUpdate(
    studentExamId,
    { status: "SUBMITTED", submittedAt: new Date() },
    { new: true }
  );

  if (!submittedExam) throw new Error("Exam not found");

  await ExamLog.create({
    studentExam: studentExamId,
    eventType: "SUBMIT_EXAM",
    details: { student: submittedExam.student },
  });

  // ✅ Auto-evaluate MCQs (skip theory)
  const evaluation = await evaluateExam({
    studentExamId,
    evaluatorId: "system", // or null, or req.user._id (if you want)
  });

  return {
    submittedExam,
    evaluation,
  };
};

// ---------------- READ-ONLY QUERIES ----------------

// Get one student’s submission
export const getStudentSubmissionService = async ({ student, exam }) => {
  return await StudentExam.findOne({ student, exam })
    .populate("exam", "title category domain duration");
};

// Get all submissions for an exam
export const getAllSubmissionsService = async ({ exam }) => {
  return await StudentExam.find({ exam })
    .populate("student", "name email rollNumber");
};

// Get logs of a student exam (with filters & limit)
export const getExamLogsService = async ({ studentExamId, type, limit = 100 }) => {
  const query = { studentExam: studentExamId };
  if (type) query.eventType = type; // filter by event type if needed

  return await ExamLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get details of a single student exam
export const getStudentExamService = async ({ id }) => {
  return await StudentExam.findById(id)
    .populate("student", "name email rollNumber")
    .populate("exam", "title category domain duration");
};

// Get all exams attempted by a student
export const getExamsByStudentService = async ({ userId }) => {
  return await StudentExam.find({ student: userId })
    .populate("exam", "title category domain duration");
};

// services/exam.service.js
export const getActiveStudentsService = async ({
  limit = 20,
  since,
  eventTypes,
} = {}) => {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const sinceDate = since ? new Date(since) : null;

  const typeList = Array.isArray(eventTypes)
    ? eventTypes
    : typeof eventTypes === "string" && eventTypes.trim()
    ? eventTypes.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const logQuery = {};
  if (sinceDate && !isNaN(sinceDate.getTime())) logQuery.createdAt = { $gte: sinceDate };
  if (typeList && typeList.length) logQuery.eventType = { $in: typeList };

  const activeExams = await StudentExam.find({ status: "IN_PROGRESS" })
    .populate("student", "name email rollNumber")
    .populate("exam", "title category domain duration")
    .lean();

  const results = await Promise.all(
    activeExams.map(async (exam) => {
      const base = { studentExam: exam._id, ...logQuery };

      // latest N for UI
      const logs = await ExamLog.find(base, { eventType: 1, details: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean();

      // total for accurate badge/count
      const logsTotal = await ExamLog.countDocuments(base);

      return { ...exam, logs, logsTotal }; // ← add total here
    })
  );

  return results;
};

// services/exam.service.js
export const getStudentsForMentorPageService = async ({
  limit = 20,
  since,
  eventTypes,
} = {}) => {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default to 30 days ago

  const typeList = Array.isArray(eventTypes)
    ? eventTypes
    : typeof eventTypes === "string" && eventTypes.trim()
    ? eventTypes.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const logQuery = {};
  if (sinceDate && !isNaN(sinceDate.getTime())) {
    logQuery.createdAt = { $gte: sinceDate };
  }
  if (typeList && typeList.length) {
    logQuery.eventType = { $in: typeList };
  }

  // Include exams that are still active or recently completed
  const studentExams = await StudentExam.find({
    status: { $in: ["IN_PROGRESS", "SUBMITTED", "BLOCKED"] },
    updatedAt: { $gte: sinceDate }
  })
    .populate("student", "name email rollNumber")
    .populate("exam", "title category domain duration")
    .lean();

  const results = await Promise.all(
    studentExams.map(async (exam) => {
      const base = { studentExam: exam._id, ...logQuery };

      const logs = await ExamLog.find(base, {
        eventType: 1,
        details: 1,
        createdAt: 1,
      })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean();

      const logsTotal = await ExamLog.countDocuments({ studentExam: exam._id });

      return {
        ...exam,
        logs,
        logsTotal,
      };
    })
  );

  return results;
};

