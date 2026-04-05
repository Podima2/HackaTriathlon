export type ClientRole = "phone" | "laptop";

export type SignalingMessage =
  | {
      type: "join";
      role: ClientRole;
      roomId: string;
    }
  | {
      type: "offer";
      roomId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "answer";
      roomId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "ice-candidate";
      roomId: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: "disconnect";
      roomId: string;
    };

export type ServerMessage =
  | {
      type: "joined";
      roomId: string;
      peers: number;
    }
  | {
      type: "peer-joined";
      roomId: string;
      peers: number;
    }
  | {
      type: "peer-left";
      roomId: string;
      peers: number;
    }
  | {
      type: "error";
      message: string;
    }
  | SignalingMessage;

export type IceProvider = "cloudflare" | "twilio";

export interface IceConfigResponse {
  provider: IceProvider;
  iceServers: RTCIceServer[];
}
