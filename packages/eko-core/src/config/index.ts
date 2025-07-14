type GlobalConfig = {
  name: string;
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
  maxTokens: number;
  compressThreshold: number; // Dialogue context compression threshold (message count)
  largeTextLength: number;
  fileTextMaxLength: number;
  maxDialogueImgFileNum: number;
}

const config: GlobalConfig = {
  name: "AnyGO",
  platform: "mac",
  maxReactNum: 500,
  maxTokens: 16000,
  compressThreshold: 80,
  largeTextLength: 5000,
  fileTextMaxLength: 20000,
  maxDialogueImgFileNum: 1,
};

export default config;