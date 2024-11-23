import { Eko }  from '../src/eko.js';
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-3-5-sonnet-20241022",
  temperature: 0
});

const eko = new Eko(model);

const workflow = await eko.invoke(`打开领英，搜索 Chromium 开发者，将前十页的信息整理成一个表格`);

if(workflow !== null){
    const result = eko.execute(workflow, {
        callback (node) {
            console.log(node);
        }
    });
}


// console.log(result)
