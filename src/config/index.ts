type GlobalConfig = {
  name: string;
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
  maxTokens: number;
  compressThreshold: number; // Dialogue context compression threshold (message count)
}

const config: GlobalConfig = {
  name: "Fellou",
  platform: "mac",
  maxReactNum: 200,
  maxTokens: 16000,
  compressThreshold: 60,
};

export default config;