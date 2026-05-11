const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs");

// 初始化 ts-morph 项目
const project = new Project();

// 读取包含文件映射的 json 数据
const jsonPath = "dev/Item/item_ts.json";
const itemMap = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const outputData = {};

console.log("开始解析 TS 文件...");

for (const [className, filePath] of Object.entries(itemMap)) {
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
        console.warn(`[跳过] 在 ${filePath} 中未找到 Class`);
        continue;
    }

    let superArg6 = undefined;
    let descriptionGetterText = undefined;

    // --- 1. 提取构造函数中 super() 的第 6 个参数 ---
    const constructors = classDecl.getConstructors();
    if (constructors.length > 0) {
        const ctor = constructors[0];

        // 寻找 super 关键字，并获取它的父节点（即 super() 调用表达式）
        const superCall = ctor.getFirstDescendantByKind(SyntaxKind.SuperKeyword)?.getParentIfKind(SyntaxKind.CallExpression);

        if (superCall) {
            const args = superCall.getArguments();
            // 数组索引从 0 开始，第 6 个参数索引为 5
            if (args.length >= 6) {
                // .getText() 会原样提取代码字符串（无论是普通字符串、模板、变量等）
                superArg6 = args[5].getText();
            }
        }
    }

    // --- 2. 提取 description getter ---
    // 专门获取 getter 访问器
    const descGetter = classDecl.getGetAccessor("description");
    if (descGetter) {
        // 获取整个 getter 函数体的代码
        descriptionGetterText = descGetter.getText();
    }

    // 记录到结果对象中
    outputData[className] = {
        filePath: filePath,
        superArg6: superArg6 !== undefined ? superArg6 : null,
        descriptionGetter: descriptionGetterText !== undefined ? descriptionGetterText : null,
    };

    console.log(`已处理: ${className}`);
}

// 写入本地用于未来对比比对的 JSON 文件
const outputPath = "dev/Item/class_tracker.json";
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 4), "utf8");

console.log(`\n解析完成！结果已保存至: ${outputPath}`);
