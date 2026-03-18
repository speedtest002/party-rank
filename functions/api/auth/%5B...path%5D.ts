import { getAuth } from "../../lib/auth";

export const onRequest = async (context: any) => {
  const auth = getAuth(context.env);
  return auth.handler(context.request);
};
