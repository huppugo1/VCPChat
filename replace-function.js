const fs = require('fs');

// 读取文件
const originalContent = fs.readFileSync('modules/topicListManager.js', 'utf8');
const newFunction = fs.readFileSync('new-loadTopicList.js', 'utf8');

// 找到函数的开始和结束
const startMarker = '    async function loadTopicList() {';
const endMarker = '\n    function setupTopicSearch() {';

const startIndex = originalContent.indexOf(startMarker);
const endIndex = originalContent.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error('❌ 未找到函数边界');
    console.log('startIndex:', startIndex);
    console.log('endIndex:', endIndex);
    process.exit(1);
}

console.log('✅ 找到函数位置');
console.log('  开始:', startIndex);
console.log('  结束:', endIndex);

// 组合新内容
const beforeFunction = originalContent.substring(0, startIndex);
const afterFunction = originalContent.substring(endIndex);
const newContent = beforeFunction + newFunction.trim() + '\n' + afterFunction;

// 保存
fs.writeFileSync('modules/topicListManager.js', newContent, 'utf8');

console.log('✅ 替换完成！');
console.log('备份文件: modules/topicListManager.js.backup');
