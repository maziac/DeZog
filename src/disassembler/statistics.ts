
/// Used for subroutine statistics like size or cyclomatic complexity.
export interface SubroutineStatistics {
	/// In case of a SUB routine (or RST): The size of the subroutine in bytes.
	sizeInBytes: number;

	/// In case of a SUB routine (or RST): The size of the subroutine in number of instructions.
	countOfInstructions: number;

	/// In case of a SUB routine (or RST): The Cyclomatic Complexity.
	CyclomaticComplexity: number;
}
