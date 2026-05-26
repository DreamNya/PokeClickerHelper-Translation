const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs");

// 初始化 ts-morph 项目
const project = new Project();

// 读取包含文件映射的 json 数据
const jsonPath = "dev/Quest/quest_ts.json";
const itemMap = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const outputData = {};

console.log("开始解析 TS 文件...");

// 全局默认需要追踪的字段（不包含superArg6）
const DEFAULT_TRACK_FIELDS = ["defaultDescription", "customDescription"];

for (const [className, { filePath, extraTracks = [] }] of Object.entries(itemMap)) {
    // 检查文件是否存在，防止脚本因文件缺失而报错退出
    if (!fs.existsSync(filePath)) {
        console.warn(`[跳过] 文件未找到: ${filePath}`);
        continue;
    }

    // 将源文件添加到 project 中
    const sourceFile = project.addSourceFileAtPath(filePath);

    // 尝试通过类名获取 class 节点；如果找不到，退而求其次获取该文件中的第一个 class
    const classDecl = sourceFile.getClass(className) || sourceFile.getClasses()[0];
    if (!classDecl) {
        console.warn(`[跳过] 在 ${filePath} 中未找到 Class: ${className}`);
        continue;
    }

    // --- 动态追溯提取方法 (Method) 或 访问器 (Getter) ---
    const trackFields = [...DEFAULT_TRACK_FIELDS, ...extraTracks];
    const trackedFeatures = {};

    for (const fieldName of trackFields) {
        // 只看当前类节点，不向上追溯父类
        const targetNode = classDecl.getGetAccessor(fieldName) || classDecl.getMethod(fieldName);
        trackedFeatures[fieldName] = targetNode ? targetNode.getText() : null;
    }

    // 记录到结果对象中
    outputData[className] = {
        filePath,
        trackedFeatures,
    };

    console.log(`已处理: ${className}`);
}

// 写入本地用于未来对比比对的 JSON 文件
const outputPath = "dev/Quest/class_tracker.json";
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 4), "utf8");

console.log(`\n解析完成！结果已保存至: ${outputPath}`);
