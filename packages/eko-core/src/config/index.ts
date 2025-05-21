type GlobalConfig = {
  name: string;
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
  maxTokens: number;
  compressThreshold: number; // Dialogue context compression threshold (message count)
  largeTextLength: number;
  shortTextLength: number;
}

const config: GlobalConfig = {
  name: "Eko",
  platform: "mac",
  maxReactNum: 200,
  maxTokens: 16000,
  compressThreshold: 60,
  largeTextLength: 5000,
  shortTextLength: 800,
};

export default config;