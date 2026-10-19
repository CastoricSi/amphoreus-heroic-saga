import assert from "node:assert/strict";
import test from "node:test";
import { parseBlocks, parseStarRailMission } from "./sr-wikitext-parser.js";
import { titleFromInput } from "./sr-bwiki-client.js";

test("递归保留折叠、选项和选项内的嵌套选项", () => {
  const source = `{{任务
|任务名称=嵌套测试
|任务流程=*第一步
}}
==剧情内容==
{{折叠|标题=外层内容|内容=
{{剧情选项
|选项1=[[某页面|选择 A]]
|剧情1=*甲：第一句
{{剧情选项|选项1=内层选项|剧情1=*乙：内层回复}}
|选项2=选择 B
}}
|折叠=是}}`;

  const result = parseStarRailMission(source, { title: "嵌套测试" });
  assert.equal(result.mission.name, "嵌套测试");
  assert.deepEqual(result.mission.objectives, ["第一步"]);

  const fold = result.content[0];
  assert.equal(fold.type, "fold");
  assert.equal(fold.title, "外层内容");
  assert.equal(fold.collapsed, true);

  const outerChoice = fold.content[0];
  assert.equal(outerChoice.type, "choice");
  assert.equal(outerChoice.options[0].text, "选择 A");
  assert.deepEqual(outerChoice.options[1].content, []);
  assert.deepEqual(outerChoice.options[0].content[0], {
    type: "dialogue",
    speaker: "甲",
    text: "第一句",
  });

  const innerChoice = outerChoice.options[0].content[1];
  assert.equal(innerChoice.type, "choice");
  assert.equal(innerChoice.options[0].text, "内层选项");
  assert.deepEqual(innerChoice.options[0].content[0], {
    type: "dialogue",
    speaker: "乙",
    text: "内层回复",
  });
});

test("将短信模板转换为消息和消息选项", () => {
  const source = `{{任务|任务名称=短信测试}}
==剧情内容==
{{角色对话|模板开始|群聊|副标题}}
{{角色对话|左|三月七|文本|在吗？}}
{{短信选项|选项1=在。|剧情1={{角色对话|右|开拓者|文本|在。}}}}
{{短信警告|信息发送失败}}
{{角色对话|模板结束}}`;
  const result = parseStarRailMission(source);
  assert.deepEqual(result.content.map((node) => node.type), ["message-thread"]);
  assert.equal(result.content[0].title, "群聊");
  assert.equal(result.content[0].subtitle, "副标题");
  assert.equal(result.content[0].owner, "开拓者");
  assert.deepEqual(result.content[0].content.map((node) => node.type), ["message", "choice", "message-system"]);
  assert.equal(result.content[0].content[1].presentation, "message");
  assert.equal(result.content[0].content[1].options[0].content[0].text, "在。");
});

test("将短信折叠识别为带标题、副标题和手机持有者的短信块", () => {
  const source = `{{任务|任务名称=短信折叠测试}}
==剧情内容==
{{折叠|标题=短信：星穹列车一家人<br><small>任务结束后</small>|内容=
{{角色对话|左|瓦尔特|文本|情况如何？|是}}
{{剧情选项|选项1=我们很快就回来|剧情1={{角色对话|右|开拓者|文本|我们很快就回来}}}}
}}`;
  const thread = parseStarRailMission(source).content[0];
  assert.equal(thread.type, "message-thread");
  assert.equal(thread.title, "星穹列车一家人");
  assert.equal(thread.subtitle, "任务结束后");
  assert.equal(thread.owner, "开拓者");
  assert.equal(thread.content[0].side, "left");
  assert.equal(thread.content[1].options[0].content[0].side, "right");
});

test("保留普通图片、短信图片和短信表情的文件引用", () => {
  const content = parseBlocks(`[[File:开拓任务-腐烂或燃烧-CG2.png|center|600px]]
{{角色对话|左|布洛妮娅|图片|短信-测试图片.png|是}}
{{角色对话|左|布洛妮娅|表情|00-01|是}}`);
  assert.deepEqual(content[0], { type: "image", file: "开拓任务-腐烂或燃烧-CG2.png", displayWidth: "600px", align: "center" });
  assert.equal(content[1].contentType, "image");
  assert.equal(content[1].file, "短信-测试图片.png");
  assert.equal(content[2].contentType, "sticker");
  assert.equal(content[2].sticker, "00-01");
  assert.equal(content[2].file, "聊天表情-00-01.png");
});

test("保留跨行居中图片及正文中的内联图片", () => {
  const content = parseBlocks(`<center>{{图片放大|线索.png|500px|900px}}<br>
似乎只要将雕像归位，就能开启大门……</center>
:{{颜色|描述|获得贴纸[[file:贴纸.png|50px|link=图鉴]]贴纸名称}}`);
  assert.deepEqual(content[0], { type: "image", file: "线索.png", displayWidth: "500px", fullWidth: "900px" });
  assert.deepEqual(content[1], { type: "text", text: "似乎只要将雕像归位，就能开启大门……" });
  assert.equal(content[2].text, "获得贴纸贴纸名称");
  assert.deepEqual(content[2].images, [{ file: "贴纸.png", displayWidth: "50px" }]);
});

test("任务名称中的注释模板只保留显示文本", () => {
  const source = `{{任务|任务名称={{梗|显示名称|梗典故|很长的注释}}}}
==剧情内容==`;
  assert.equal(parseStarRailMission(source).mission.name, "显示名称");
});

test("完整保留注音模板的正文和注音", () => {
  const source = `{{任务|任务名称=注音测试}}
==剧情内容==
*卡芙卡：{{注音|艾利欧|星核猎手}}看见的未来不会出错。
*{{注音|？？？|流萤}}：你好。`;
  const result = parseStarRailMission(source);
  assert.equal(result.content[0].text, "{{艾利欧|星核猎手}}看见的未来不会出错。");
  assert.equal(result.content[1].speaker, "{{？？？|流萤}}");
});

test("外部链接转换为 Markdown 链接", () => {
  const source = `{{任务|任务名称=链接测试}}
==剧情内容==
{{折叠|标题=开场动画[https://www.bilibili.com/video/BV1test?p=1 「一幕短剧」]|内容=*旁白：内容}}`;
  const result = parseStarRailMission(source);
  assert.equal(result.content[0].title, "开场动画[「一幕短剧」](https://www.bilibili.com/video/BV1test?p=1)");
});

test("保留 tabber 的各个条件分支", () => {
  const source = `{{任务|任务名称=分页测试}}
==剧情内容==
<tabber>
女开拓者「星」=
*三月七：星分支
|-|
男开拓者「穹」=
*三月七：穹分支
|-|对局胜利=
{{剧情选项|选项1=我赢了！}}
</tabber>`;
  const tabs = parseStarRailMission(source).content[0];
  assert.equal(tabs.type, "tabs");
  assert.equal(tabs.tabs[0].title, "女开拓者「星」");
  assert.equal(tabs.tabs[0].content[0].text, "星分支");
  assert.equal(tabs.tabs[1].title, "男开拓者「穹」");
  assert.equal(tabs.tabs[1].content[0].text, "穹分支");
  assert.equal(tabs.tabs[2].title, "对局胜利");
  assert.equal(tabs.tabs[2].content[0].options[0].text, "我赢了！");
});

test("选项剧情里的 tabber 不会被竖线拆断", () => {
  const source = `{{任务|任务名称=嵌套分页}}
==剧情内容==
{{剧情选项
|选项1=开始
|剧情1=<tabber>
|-|胜利=
{{剧情选项|选项1=我赢了}}
|-|失败=
{{剧情选项|选项1=我输了}}
</tabber>
|选项2=离开
}}`;
  const outerChoice = parseStarRailMission(source).content[0];
  const tabs = outerChoice.options[0].content[0];
  assert.equal(tabs.type, "tabs");
  assert.equal(tabs.tabs.length, 2);
  assert.equal(tabs.tabs[0].content[0].options[0].text, "我赢了");
  assert.equal(tabs.tabs[1].content[0].options[0].text, "我输了");
});

test("从 BWiki URL 保留子页面标题", () => {
  assert.equal(
    titleFromInput("https://wiki.biligame.com/sr/%E5%91%BD%E8%BF%90/%E9%A9%BB%E8%B6%B3%E6%A2%A6%E5%9B%BD%E4%B9%8B%E5%A4%9C"),
    "命运/驻足梦国之夜",
  );
});

test("识别缩进模板与消息内的折叠内容", () => {
  const source = `{{任务|任务名称=缩进测试}}
==剧情内容==
  {{剧情选项|选项1=缩进选项}}
{{角色对话|左|群友|文本|{{折叠|标题=视频|内容=*播音员：新闻内容|折叠=是}}|是}}`;
  const result = parseStarRailMission(source);
  assert.equal(result.content[0].type, "choice");
  assert.equal(result.content[1].type, "message");
  assert.equal(result.content[1].content[0].type, "fold");
  assert.equal(result.content[1].content[0].content[0].speaker, "播音员");
});

test("提示模板分别保留正文和地点", () => {
  const source = `{{任务|任务名称=提示测试}}
==剧情内容==
{{提示|蓝色|宽度=100%|提示正文|任务地点}}`;
  assert.deepEqual(parseStarRailMission(source).content[0], {
    type: "note",
    tone: "蓝色",
    text: "提示正文",
    context: "任务地点",
  });
});

test("可直接解析用于导入的 BWiki 剧情片段", () => {
  const content = parseBlocks(`*帕姆：要宣布一件事。
{{剧情选项
|选项1=我愿意。
|剧情1=*三月七：好耶！
|选项2=再想想。
|剧情2={{剧情选项|选项1=还是愿意。|剧情1=*帕姆：欢迎！}}
}}
=== 宣誓 ===
{{任务描述|愿此行，终抵群星。|观景车厢}}`);
  assert.equal(content[0].type, "dialogue");
  assert.equal(content[1].type, "choice");
  assert.equal(content[1].options[1].content[0].type, "choice");
  assert.equal(content[2].type, "section");
  assert.deepEqual(content[3], { type: "objective-description", text: "愿此行，终抵群星。", location: "观景车厢" });
});
