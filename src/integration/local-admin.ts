/**
 * 本地写作后台的 Vite 插件（仅开发环境生效）
 *
 * 为什么用 Vite 中间件而不是 Astro API 路由：
 *   - 本项目是纯静态构建（output: 'static'），API 路由不会生成
 *   - 改成 server 模式会影响线上部署方式
 *   - Vite 中间件只在 `pnpm dev` 时挂载，生产构建完全不存在这段代码
 *
 * 挂载的接口：
 *   GET    /api/admin/posts           列出文章
 *   GET    /api/admin/posts?slug=xxx  读取单篇
 *   POST   /api/admin/posts           新建 / 保存
 *   DELETE /api/admin/posts?slug=xxx  删除
 *   POST   /api/admin/upload          上传图片（multipart）
 */
import fs from "node:fs/promises";
import path from "node:path";

const POSTS_DIR = "src/content/posts";
const IMAGES_ROOT = "public/images/posts";

/** 生成安全 slug，杜绝路径穿越 */
function safeSlug(raw) {
	const slug = String(raw ?? "")
		.trim()
		.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (!slug) throw new Error("slug 不能为空");
	return slug;
}

/** 读请求体 */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

/** 组装 frontmatter（字符串统一加引号，防止中文冒号破坏 YAML） */
function buildFrontmatter(d) {
	const lines = ["---"];
	const push = (k, v) => {
		if (v === undefined || v === null || v === "") return;
		if (Array.isArray(v)) {
			if (v.length === 0) return;
			lines.push(`${k}: ${JSON.stringify(v)}`);
		} else if (typeof v === "boolean" || typeof v === "number") {
			lines.push(`${k}: ${v}`);
		} else {
			lines.push(`${k}: ${JSON.stringify(String(v))}`);
		}
	};
	push("title", d.title);
	// 日期必须裸写（不加引号），否则 YAML 会当成字符串，Astro schema 校验失败
	if (d.published) lines.push(`published: ${d.published}`);
	if (d.updated) lines.push(`updated: ${d.updated}`);
	push("description", d.description);
	push("category", d.category);
	push("tags", d.tags);
	push("image", d.image);
	push("draft", d.draft);
	push("pinned", d.pinned);
	lines.push("---", "");
	return lines.join("\n");
}

/** 解析 frontmatter（只需覆盖本项目用到的标量 / 数组） */
function parseFrontmatter(raw) {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!m) return { data: {}, body: raw };
	const data = {};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
		if (!kv) continue;
		const [, key, rawVal] = kv;
		const s = rawVal.trim();
		let val;
		if (s.startsWith("[") && s.endsWith("]")) {
			try {
				val = JSON.parse(s.replace(/'/g, '"'));
			} catch {
				val = s
					.slice(1, -1)
					.split(",")
					.map((x) => x.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean);
			}
		} else if (s === "true" || s === "false") {
			val = s === "true";
		} else if (/^-?\d+(\.\d+)?$/.test(s)) {
			val = Number(s);
		} else {
			val = s.replace(/^["']|["']$/g, "");
		}
		data[key] = val;
	}
	return { data, body: raw.slice(m[0].length) };
}

function json(res, code, obj) {
	res.statusCode = code;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.end(JSON.stringify(obj));
}

/** 极简 multipart 解析（够处理单个图片文件） */
function parseMultipart(buffer, boundary) {
	const results = [];
	const delim = Buffer.from(`--${boundary}`);
	let pos = 0;
	while (true) {
		const start = buffer.indexOf(delim, pos);
		if (start === -1) break;
		const next = buffer.indexOf(delim, start + delim.length);
		if (next === -1) break;
		const part = buffer.subarray(start + delim.length + 2, next - 2);
		const headerEnd = part.indexOf("\r\n\r\n");
		if (headerEnd !== -1) {
			const headers = part.subarray(0, headerEnd).toString("utf8");
			const data = part.subarray(headerEnd + 4);
			const nameMatch = headers.match(/name="([^"]+)"/);
			const fileMatch = headers.match(/filename="([^"]*)"/);
			const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
			results.push({
				name: nameMatch?.[1],
				filename: fileMatch?.[1],
				type: typeMatch?.[1]?.trim(),
				data,
			});
		}
		pos = next;
	}
	return results;
}

export default function localAdmin() {
	return {
		name: "local-admin-api",
		apply: "serve", // 只在 dev server 生效
		configureServer(server) {
			const root = server.config.root;

			server.middlewares.use(async (req, res, next) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				// 项目启用了 trailingSlash: "always"，Vite 会把无斜杠路径重定向；
				// 这里统一去掉尾斜杠再匹配，两种写法都能命中。
				const pathname = url.pathname.replace(/\/+$/, "");
				if (pathname !== "/api/admin/posts") return next();
				try {
					const slugParam = url.searchParams.get("slug");
					const postsDir = path.join(root, POSTS_DIR);

					if (req.method === "GET") {
						if (slugParam) {
							const file = path.join(postsDir, safeSlug(slugParam), "index.md");
							const raw = await fs.readFile(file, "utf8");
							const { data, body } = parseFrontmatter(raw);
							return json(res, 200, { ok: true, slug: slugParam, ...data, body });
						}
						await fs.mkdir(postsDir, { recursive: true });
						const entries = await fs.readdir(postsDir, { withFileTypes: true });
						const posts = [];
						for (const e of entries) {
							if (!e.isDirectory()) continue;
							try {
								const raw = await fs.readFile(
									path.join(postsDir, e.name, "index.md"),
									"utf8",
								);
								const { data } = parseFrontmatter(raw);
								posts.push({ slug: e.name, ...data });
							} catch {
								/* 忽略没有 index.md 的目录 */
							}
						}
						posts.sort((a, b) =>
							String(b.published ?? "").localeCompare(String(a.published ?? "")),
						);
						return json(res, 200, { ok: true, posts });
					}

					if (req.method === "POST") {
						const raw = await readBody(req);
						const body = JSON.parse(raw.toString("utf8"));
						if (!body.title) return json(res, 400, { ok: false, error: "标题不能为空" });
						const slug = safeSlug(body.slug);
						const dir = path.join(postsDir, slug);
						await fs.mkdir(dir, { recursive: true });
						const front = buildFrontmatter({
							title: body.title,
							published: body.published || new Date().toISOString().slice(0, 10),
							updated: new Date().toISOString().slice(0, 10),
							description: body.description,
							category: body.category,
							tags: body.tags,
							image: body.image,
							draft: body.draft ?? false,
							pinned: body.pinned ?? false,
						});
						await fs.writeFile(
							path.join(dir, "index.md"),
							front + String(body.body ?? ""),
							"utf8",
						);
						return json(res, 200, { ok: true, slug });
					}

					if (req.method === "DELETE") {
						if (!slugParam) return json(res, 400, { ok: false, error: "缺少 slug" });
						const slug = safeSlug(slugParam);
						await fs.rm(path.join(postsDir, slug), { recursive: true, force: true });
						return json(res, 200, { ok: true, slug });
					}

					return json(res, 405, { ok: false, error: "不支持的方法" });
				} catch (err) {
					return json(res, 500, { ok: false, error: String(err?.message ?? err) });
				}
			});

			server.middlewares.use(async (req, res, next) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				const pathname = url.pathname.replace(/\/+$/, "");
				if (pathname !== "/api/admin/upload") return next();
				try {
					if (req.method !== "POST") {
						return json(res, 405, { ok: false, error: "只支持 POST" });
					}
					const ct = req.headers["content-type"] ?? "";
					const boundary = ct.match(/boundary=(.+)$/)?.[1];
					if (!boundary) return json(res, 400, { ok: false, error: "缺少 boundary" });

					const buf = await readBody(req);
					const parts = parseMultipart(buf, boundary);
					const filePart = parts.find((p) => p.filename);
					if (!filePart) return json(res, 400, { ok: false, error: "没有收到文件" });

					const slugPart = parts.find((p) => p.name === "slug" && !p.filename);
					const slug = safeSlug(slugPart?.data.toString("utf8") || "misc");

					const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
					if (!allowed.includes(filePart.type)) {
						return json(res, 400, {
							ok: false,
							error: `不支持的格式：${filePart.type}`,
						});
					}
					if (filePart.data.length > 20 * 1024 * 1024) {
						return json(res, 400, { ok: false, error: "图片超过 20MB" });
					}

					const dir = path.join(root, IMAGES_ROOT, slug);
					await fs.mkdir(dir, { recursive: true });

					const base =
						String(filePart.filename ?? "image")
							.replace(/\.[^.]+$/, "")
							.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "-")
							.replace(/-+/g, "-")
							.replace(/^-|-$/g, "")
							.slice(0, 60) || "image";

					/*
					 * 自动压缩：除 SVG / GIF（动图）外，统一转 WebP。
					 * - 宽度上限 1600px（正文插图够用，2x 屏也不糊）
					 * - 质量 82，肉眼无损
					 * - SVG 保持矢量不动；GIF 保留原样避免丢帧
					 */
					let outData = filePart.data;
					let ext = ".webp";
					let dimension = "";

					if (filePart.type === "image/svg+xml") {
						ext = ".svg";
					} else if (filePart.type === "image/gif") {
						ext = ".gif";
					} else {
						try {
							const sharp = (await import("sharp")).default;
							const meta = await sharp(filePart.data).metadata();
							const resized = sharp(filePart.data)
								.rotate() // 按 EXIF 自动转正
								.resize({
									width: Math.min(meta.width ?? 1600, 1600),
									withoutEnlargement: true,
								})
								.webp({ quality: 82, effort: 5 });
							outData = await resized.toBuffer();
							const after = await sharp(outData).metadata();
							dimension = `${after.width}×${after.height}`;
						} catch (imgErr) {
							// 压缩失败则原样保存，不让上传整体失败
							ext =
								filePart.type === "image/png" ? ".png" : ".jpg";
							outData = filePart.data;
						}
					}

					let name = `${base}${ext}`;
					let i = 1;
					while (true) {
						try {
							await fs.access(path.join(dir, name));
							name = `${base}-${i++}${ext}`;
						} catch {
							break;
						}
					}

					await fs.writeFile(path.join(dir, name), outData);
					const urlPath = `/images/posts/${slug}/${name}`;
					return json(res, 200, {
						ok: true,
						url: urlPath,
						name,
						originalSize: filePart.data.length,
						size: outData.length,
						dimension,
					});
				} catch (err) {
					return json(res, 500, { ok: false, error: String(err?.message ?? err) });
				}
			});

			/* ---------------- 一键部署：git add → commit → push ---------------- */
			server.middlewares.use(async (req, res, next) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				const pathname = url.pathname.replace(/\/+$/, "");
				if (pathname !== "/api/admin/deploy") return next();

				const { execFile } = await import("node:child_process");
				const run = (args) =>
					new Promise((resolve) => {
						execFile(
							"git",
							args,
							{ cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
							(error, stdout, stderr) =>
								resolve({
									ok: !error,
									stdout: String(stdout ?? ""),
									stderr: String(stderr ?? ""),
								}),
						);
					});

				try {
					if (req.method === "GET") {
						const status = await run(["status", "--porcelain"]);
						const branch = await run(["rev-parse", "--abbrev-ref", "HEAD"]);
						const ahead = await run(["rev-list", "--count", "@{u}..HEAD"]);
						const lines = status.stdout.trim().split("\n").filter(Boolean);
						return json(res, 200, {
							ok: true,
							dirty: lines.length > 0,
							changed: lines.length,
							branch: branch.stdout.trim(),
							ahead: Number(ahead.stdout.trim() || 0),
						});
					}

					if (req.method !== "POST") {
						return json(res, 405, { ok: false, error: "只支持 GET / POST" });
					}

					const raw = await readBody(req);
					let msg = "";
					try {
						msg = JSON.parse(raw.toString("utf8")).message ?? "";
					} catch {
						/* 允许空 body */
					}
					const commitMsg =
						String(msg).trim() || `更新内容 ${new Date().toLocaleString("zh-CN")}`;

					const add = await run(["add", "-A"]);
					if (!add.ok) {
						return json(res, 500, { ok: false, error: "git add 失败", detail: add.stderr });
					}

					const commit = await run(["commit", "-m", commitMsg]);
					const nothingToCommit = /nothing to commit|无文件要提交/i.test(
						commit.stdout + commit.stderr,
					);

					const push = await run(["push"]);
					return json(res, 200, {
						ok: push.ok,
						nothingToCommit,
						commitMessage: commitMsg,
						output: (push.stdout + push.stderr).trim(),
						error: push.ok ? "" : push.stderr.trim(),
					});
				} catch (err) {
					return json(res, 500, { ok: false, error: String(err?.message ?? err) });
				}
			});

			server.config.logger.info(
				"  ➜  Local admin: http://localhost/api/admin (写作后台挂载成功)",
			);
		},
	};
}
