export type BroadcastMsg =
  | { type: "chat"; chat: import("./chat").Chat }
  | { type: "join"; user: import("./participant").Participant }
  | { type: "leave"; user: import("./participant").Participant }
  | { type: "req-presence" }
  | { type: "clear" };
