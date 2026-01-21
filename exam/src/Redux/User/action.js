// actions/userActions.js
import api from "../../config/api";
import {
  LOGIN_USER_FAIL,
  LOGIN_USER_REQUEST,
  LOGIN_USER_SUCCESS,
  REGISTER_USER_FAIL,
  REGISTER_USER_REQUEST,
  REGISTER_USER_SUCCESS,
  BULK_SET_ROWS,
  BULK_CLEAR,
  BULK_UPLOAD_REQUEST,
  BULK_UPLOAD_SUCCESS,
  BULK_UPLOAD_FAIL,
} from "./actionType";

// ---------- SINGLE REGISTER ----------
export const registerUser = (data) => async (dispatch) => {
  try {
    dispatch({ type: REGISTER_USER_REQUEST });
    const res = await api.post("/api/users/register", data);
    dispatch({ type: REGISTER_USER_SUCCESS, payload: res.data.data });
    return res.data;
  } catch (err) {
    const msg = err.response?.data?.message || "Failed to register user";
    dispatch({ type: REGISTER_USER_FAIL, payload: msg });
    throw new Error(msg);
  }
};

// ---------- LOGIN ----------
// Redux/User/action.js
export const loginUser = (data) => async (dispatch) => {
  try {
    dispatch({ type: LOGIN_USER_REQUEST });
   // Backend expects: { email, rollNo, category, domain } with domain = ObjectId
   const res = await api.post("/api/user/login", {
     email: data.email,
     rollNo: data.rollNo,
     category: data.category,
     domain: data.domain, // id
   });

    // ⬇️ Expecting { message, token, user } from your loginService
    const { token, user, message } = res?.data?.data || {};

     if (!token) {
      throw new Error("Login succeeded but no token returned.");
    }

   const normalizedUser = {
     ...user,
     category: user?.category ?? data?.category ?? null,
     domainId: user?.domainId ?? null,
     domain: user?.domain ?? data?.domainName ?? null, // readable name
   };


    // Persist + set default header
    localStorage.setItem("ACCESS_TOKEN", token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
     if (user?.category)   localStorage.setItem("user_category", user.category);
 if (user?.domainId)   localStorage.setItem("user_domainId", user.domainId);
 if (user?.id)         localStorage.setItem("user_id", user.id);
 if (user?.email)      localStorage.setItem("user_email", user.email);
 if (user?.rollNumber) localStorage.setItem("user_roll", user.rollNumber);

      if (normalizedUser.category) localStorage.setItem("user_category", normalizedUser.category);
  if (normalizedUser.domainId) localStorage.setItem("user_domainId", normalizedUser.domainId);

   dispatch({ type: LOGIN_USER_SUCCESS, payload: { user: normalizedUser, token } });
   return { message, token, user: normalizedUser };

  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    dispatch({ type: LOGIN_USER_FAIL, payload: msg });
    throw new Error(msg);
  }
};


// ---------- BULK HELPERS ----------
export const setBulkRows = (rows) => ({ type: BULK_SET_ROWS, payload: rows });
export const clearBulk = () => ({ type: BULK_CLEAR });

// rows: [{ name, email, category, domain }]
export const uploadBulk = ({ rows, batchSize = 25, concurrency = 3 }) => async (dispatch) => {
  try {
    dispatch({ type: BULK_UPLOAD_REQUEST });
    const { data } = await api.post("/api/users/bulk", { rows, batchSize, concurrency });
    // backend should respond: { success, total, ok, failed, results: [...] }
    dispatch({ type: BULK_UPLOAD_SUCCESS, payload: data });
    return data;
  } catch (err) {
    const msg = err.response?.data?.message || err.message || "Bulk upload failed";
    dispatch({ type: BULK_UPLOAD_FAIL, payload: msg });
    throw new Error(msg);
  }
};
