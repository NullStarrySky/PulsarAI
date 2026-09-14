import { parse } from "acorn";
import type { SandboxEnvironment } from "../../../runtime/sandbox";

/** Evaluate a source-scoped module once; loading never invokes its export. */
export function importJavaScript(
	source: string,
	environment: SandboxEnvironment,
): unknown {
	try {
		const module = parse(source, {
			ecmaVersion: "latest",
			sourceType: "module",
		});
		let binding = "__pulsarDefault";
		while (source.includes(binding)) binding += "_";
		let found = false;
		let body = "";
		let cursor = 0;
		for (const node of module.body) {
			if (
				node.type === "ImportDeclaration" ||
				node.type === "ExportAllDeclaration" ||
				node.type === "ExportNamedDeclaration"
			)
				throw new Error(
					"Plugin JS 只支持 export default；导入资源请使用 imports(path)。",
				);
			if (node.type !== "ExportDefaultDeclaration") continue;
			found = true;
			const declaration = node.declaration;
			const code = source.slice(declaration.start, declaration.end);
			body += source.slice(cursor, node.start);
			if (
				(declaration.type === "FunctionDeclaration" ||
					declaration.type === "ClassDeclaration") &&
				declaration.id
			) {
				body += `${code}\n${binding} = ${declaration.id.name};`;
			} else {
				body += `${binding} = (${code.replace(/;\s*$/, "")});`;
			}
			cursor = node.end;
		}
		if (!found) throw new Error("Plugin JS 必须声明 export default。");
		body += source.slice(cursor);
		const runner = new Function(
			"environment",
			`with (environment) { let ${binding};\n${body}\nreturn ${binding};\n}`,
		);
		return runner.call(environment, environment);
	} catch (error) {
		throw new Error(
			`JS 模块导入失败：${String(environment.sourcePath ?? "")}\n${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}
