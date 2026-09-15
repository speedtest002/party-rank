import { getAuth } from "../../lib/auth";

export const onRequest: PagesFunction<any> = async (context) => {
  const { request, env } = context;
  const auth = getAuth(env);
  
  // Middleware này sẽ xử lý toàn bộ các request gửi đến /api/auth/*
  return auth.handler(request);
};
