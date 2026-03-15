// Gateway WebSocket frame types (inspired by DenchClaw's req/res/event protocol)

export type GatewayReqFrame = {
  type: "req";
  id: string;
  method: string; // "connect","agent","agent.subscribe","sessions.patch","chat.abort","health"
  params?: unknown;
};

export type GatewayResFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: unknown;
};

export type GatewayEventFrame = {
  type: "event";
  event: string; // "agent","chat","error","connect.challenge"
  seq?: number;
  payload?: unknown;
};

export type GatewayFrame =
  | GatewayReqFrame
  | GatewayResFrame
  | GatewayEventFrame;
