# clone-refactor-llm

Python Scipts:

mine.py: Contains code to mine clones for each project from their html reports. You need to provide the project name and the path to related html reports folder (can be downloaded from Table 1 Deckard results). It will output a csv file, which includes Pair ID (clone group id), Source Folder 1, Package 1, Class 1, Method 1, Start Line 1, End Line 1, Source Folder 2, Package 2, Class 2, Method 2, Start Line 2, End Line 2, Left Code, Right Code and Clone Type.

whole_method_clones_same_file.py: Contains code for running clone type classification and refactoring on whole method clones in the same file via Azure OpenAI.

whole_method_clones_different_files.py: Contains code for running clone type classification and refactoring on whole method clones in different files via Azure OpenAI.

code_fragment_clones_same_files.py: Contains code for running clone type classification and refactoring on code fragment clones in the same file via Azure OpenAI.

code_fragment_clones_different_files.py: Contains code for running clone type classification and refactoring on code fragment clones in different files via Azure OpenAI.

To run the code clone detection and refactoring scripts, replace the endpoint and api_key variables with your own Azure OpenAI credentials. Also update the file paths to match the directory structure on your machine.

Statistical Scripts:

rq1_analysis.py, rq2_analysis.py, rq3_analysis.py: Contains code for running McNemar tests on different research questions.
