type GlobalConfig = {
  name: string;
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
}

const config: GlobalConfig = {
  name: "Fellou",
  platform: "mac",
  maxReactNum: 100
};

export default config;