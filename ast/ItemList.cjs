const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs");
const path = require("path");

// 1. 初始化项目
const project = new Project();

// 2. 加载整个项目的 TS 文件
console.log("正在加载项目文件，这可能需要几秒钟...");
project.addSourceFilesAtPaths("pokeclicker/src/**/*.ts");

// 读取你的目标 class 列表
const jsonPath = "dev/Item/item_ts.json";
const itemMap = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const targetClasses = Object.keys(itemMap);

// 用于存储最终结果的对象
const instancesRecord = {};
targetClasses.forEach((cls) => (instancesRecord[cls] = []));

console.log("文件加载完成！开始扫描所有实例化代码...");

// 3. 遍历加载进来的每一个 TS 源文件
const sourceFiles = project.getSourceFiles();

for (const sourceFile of sourceFiles) {
    // 获取该文件中所有的 "new 表达式"
    const newExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression);

    for (const newExpr of newExpressions) {
        // 获取 new 后面跟着的类名标识符
        const className = newExpr.getExpression().getText();

        // 如果这个类名在我们的目标列表中
        if (targetClasses.includes(className)) {
            // 提取传入的所有参数，并将其转换为字符串数组
            // 无论是变量、数字、还是长模板字符串，getText() 都会完整保留下来
            const argsTextArray = newExpr.getArguments().map((arg) => arg.getText());

            // 获取相对路径，让输出的 JSON 更干净
            const relativePath = path
                .relative(__dirname, sourceFile.getFilePath())
                .replace(/\\/g, "/")
                .replace(/^\.\.\//, "");

            // 记录该实例的创建位置和参数
            instancesRecord[className].push({
                file: relativePath,
                line: newExpr.getStartLineNumber(),
                arguments: argsTextArray,
            });
        }
    }
}

// 4. 将结果写入本地文件
const outputPath = "dev/Item/instances_tracker.json";
fs.writeFileSync(outputPath, JSON.stringify(instancesRecord, null, 4), "utf8");

console.log(`\n扫描完成！共在 ${sourceFiles.length} 个文件中进行了查找。`);
console.log(`结果已保存至: ${outputPath}`);
