import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Card, Select, AutoComplete } from "antd";

const { Option } = Select;

const OptionsPage = () => {
  const [form] = Form.useForm();

  const [config, setConfig] = useState({
    llm: "anthropic",
    apiKey: "",
    modelName: "claude-3-5-sonnet-20241022",
    options: {
      baseURL: "https://api.anthropic.com/v1",
    },
  });

  useEffect(() => {
    chrome.storage.sync.get(["llmConfig"], (result) => {
      if (result.llmConfig) {
        if (result.llmConfig.llm === "") {
          result.llmConfig.llm = "anthropic";
        }
        setConfig(result.llmConfig);
        form.setFieldsValue(result.llmConfig);
      }
    });
  }, []);

  const handleSave = () => {
    form
      .validateFields()
      .then((values) => {
        setConfig(values);
        chrome.storage.sync.set(
          {
            llmConfig: values,
          },
          () => {
            message.success("Save Success!");
          }
        );
      })
      .catch(() => {
        message.error("Please check the form field");
      });
  };

  const modelLLMs = [
    { value: "anthropic", label: "Claude (default)" },
    { value: "openai", label: "OpenAI" },
  ];

  const modelOptions = {
    anthropic: [
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (default)" },
      { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    ],
    openai: [
      { value: "gpt-4o", label: "gpt-4o (default)" },
      { value: "gpt-4o-mini", label: "gpt-4o-mini" },
      { value: "gpt-4", label: "gpt-4" },
    ],
  };

  const handleLLMChange = (value: string) => {
    const newConfig = {
      llm: value,
      apiKey: "",
      modelName: modelOptions[value][0].value,
      options: {
        baseURL:
          value === "openai"
            ? "https://api.openai.com/v1"
            : "https://api.anthropic.com/v1",
      },
    };
    setConfig(newConfig);
    form.setFieldsValue(newConfig);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card title="Model Config" className="shadow-md">
        <Form form={form} layout="vertical" initialValues={config}>
          <Form.Item
            name="llm"
            label="LLM"
            rules={[
              {
                required: true,
                message: "Please select a LLM",
              },
            ]}
          >
            <Select placeholder="Choose a LLM" onChange={handleLLMChange}>
              {modelLLMs.map((llm) => (
                <Option key={llm.value} value={llm.value}>
                  {llm.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name={["options", "baseURL"]}
            label="Base URL"
            rules={[
              {
                required: true,
                message: "Please enter the base URL",
              },
            ]}
          >
            <Input placeholder="Please enter the base URL" />
          </Form.Item>

          <Form.Item
            name="modelName"
            label="Model Name"
            rules={[
              {
                required: true,
                message: "Please select a model",
              },
            ]}
          >
            <AutoComplete
              placeholder="Model name"
              options={modelOptions[config.llm]}
              filterOption={(inputValue, option) =>
                (option.value as string).toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[
              {
                required: true,
                message: "Please enter the API Key",
              },
            ]}
          >
            <Input.Password placeholder="Please enter the API Key" allowClear />
          </Form.Item>

          <Form.Item>
            <Button type="primary" onClick={handleSave} block>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
