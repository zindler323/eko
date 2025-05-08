type GlobalConfig = {
  name: string;
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
  maxTokens: number;
}

const config: GlobalConfig = {
  name: "Fellou",
  platform: "mac",
  maxReactNum: 100,
  maxTokens: 16000
};

export default config;