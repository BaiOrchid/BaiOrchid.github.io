const r = await fetch("http://127.0.0.1:4322/api/admin/deploy/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "加入本地文章后台 + 清理示例文章" })
});
const j = await r.json();
console.log("ok:", j.ok);
console.log("nothingToCommit:", j.nothingToCommit);
console.log("commitMessage:", j.commitMessage);
console.log("--- git 输出 ---");
console.log(j.output || "(无)");
if (j.error) console.log("--- 错误 ---\n" + j.error);
