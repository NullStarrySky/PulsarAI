/**
 * The only Vue-facing Plugin API. Dynamic SFC code receives these identifiers
 * from the controlled runtime evaluator; authored components must not import
 * a Vite module for a database-backed `.vue` resource.
 */
export {
	useFile,
	useFileContent,
	useFolder,
	useSlot,
} from "./file-composables";
