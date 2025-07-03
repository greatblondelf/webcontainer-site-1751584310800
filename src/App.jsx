import React, { useState, useRef } from 'react';

const ContactDataQualityApp = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [issues, setIssues] = useState([]);
  const [correctedData, setCorrectedData] = useState('');
  const [downloadReady, setDownloadReady] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [apiLogs, setApiLogs] = useState([]);
  const [rawResults, setRawResults] = useState({});
  const [showRawResults, setShowRawResults] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const fileInputRef = useRef(null);

  const API_BASE = 'https://builder.empromptu.ai/api_tools';
  const API_HEADERS = {
    'Authorization': 'Bearer 7euz7ipeih3mcmqzpej',
    'Content-Type': 'application/json'
  };

  const logApiCall = (method, endpoint, data, response) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      method,
      endpoint,
      data,
      response,
      id: Date.now()
    };
    setApiLogs(prev => [...prev, logEntry]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
  };

  const handleFileSelect = (event) => {
    setFiles(Array.from(event.target.files));
  };

  const resetApp = () => {
    setCurrentStep(1);
    setFiles([]);
    setProcessing(false);
    setIssues([]);
    setCorrectedData('');
    setDownloadReady(false);
    setApiLogs([]);
    setRawResults({});
    setShowRawResults(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const deleteObjects = async () => {
    try {
      const objectsToDelete = ['contact_data', 'quality_issues', 'corrected_data'];
      for (const objName of objectsToDelete) {
        const response = await fetch(`${API_BASE}/objects/${objName}`, {
          method: 'DELETE',
          headers: API_HEADERS
        });
        logApiCall('DELETE', `/objects/${objName}`, null, await response.text());
      }
      alert('All API objects deleted successfully');
    } catch (error) {
      console.error('Error deleting objects:', error);
      alert('Error deleting objects: ' + error.message);
    }
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    
    setProcessing(true);
    setCurrentStep(2);
    setIssues([]);
    setApiLogs([]);
    setRawResults({});
    
    try {
      // Step 1: Read and prepare file data
      const fileData = await Promise.all(
        files.map(file => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve({
              name: file.name,
              content: e.target.result,
              type: file.type
            });
            reader.readAsText(file);
          });
        })
      );

      // Step 2: Upload files to the system
      const inputData = fileData.map(f => `File: ${f.name}\n${f.content}`);
      const ingestPayload = {
        created_object_name: 'contact_data',
        data_type: 'strings',
        input_data: inputData
      };

      const ingestResponse = await fetch(`${API_BASE}/input_data`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(ingestPayload)
      });
      const ingestResult = await ingestResponse.text();
      logApiCall('POST', '/input_data', ingestPayload, ingestResult);
      setRawResults(prev => ({ ...prev, ingest: ingestResult }));

      // Step 3: Analyze data quality issues
      const issuesPayload = {
        created_object_names: ['quality_issues'],
        prompt_string: `Analyze this contact data for quality issues: {contact_data}

Look for these specific problems:
1. Name formatting inconsistencies (e.g., "John Smith" vs "Smith, John" vs "J. Smith")
2. Invalid email formats
3. Office location variations (e.g., "NYC" vs "New York City" vs "New York, NY")
4. Title inconsistencies (e.g., "VP" vs "Vice President")
5. Missing data in any of the 4 fields (name, email, office, title)

Return a JSON list of issues found, each with:
- row_number: which row has the issue
- field: which field (name/email/office/title)
- issue_type: what kind of problem
- current_value: what the current value is
- explanation: clear explanation of the problem

Format as valid JSON array.`,
        inputs: [{
          input_object_name: 'contact_data',
          mode: 'combine_events'
        }]
      };

      const issuesResponse = await fetch(`${API_BASE}/apply_prompt`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(issuesPayload)
      });
      const issuesResult = await issuesResponse.text();
      logApiCall('POST', '/apply_prompt', issuesPayload, issuesResult);
      setRawResults(prev => ({ ...prev, issues: issuesResult }));

      // Step 4: Generate corrected data
      const correctionPayload = {
        created_object_names: ['corrected_data'],
        prompt_string: `Clean and standardize this contact data: {contact_data}

Apply these corrections:
1. Standardize names to "First Last" format
2. Validate and fix email formats where possible
3. Standardize office locations (NYC→New York, NY; LA→Los Angeles, CA; etc.)
4. Expand title abbreviations (VP→Vice President, Dir→Director, etc.)
5. Flag missing data with "MISSING" placeholder

Return the corrected data as a clean CSV with headers: Name,Email,Office,Title
Ensure proper CSV formatting with quotes around fields containing commas.`,
        inputs: [{
          input_object_name: 'contact_data',
          mode: 'combine_events'
        }]
      };

      const correctionResponse = await fetch(`${API_BASE}/apply_prompt`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(correctionPayload)
      });
      const correctionResult = await correctionResponse.text();
      logApiCall('POST', '/apply_prompt', correctionPayload, correctionResult);
      setRawResults(prev => ({ ...prev, correction: correctionResult }));

      // Step 5: Retrieve results
      const issuesDataResponse = await fetch(`${API_BASE}/return_data/quality_issues`, {
        headers: API_HEADERS
      });
      const issuesData = await issuesDataResponse.json();
      logApiCall('GET', '/return_data/quality_issues', null, issuesData);
      setRawResults(prev => ({ ...prev, issuesData }));
      
      const correctedDataResponse = await fetch(`${API_BASE}/return_data/corrected_data`, {
        headers: API_HEADERS
      });
      const correctedDataResult = await correctedDataResponse.json();
      logApiCall('GET', '/return_data/corrected_data', null, correctedDataResult);
      setRawResults(prev => ({ ...prev, correctedDataResult }));

      // Parse issues
      try {
        const parsedIssues = JSON.parse(issuesData.text_value);
        setIssues(Array.isArray(parsedIssues) ? parsedIssues : []);
      } catch (e) {
        setIssues([{
          row_number: 'Multiple',
          field: 'General',
          issue_type: 'Analysis',
          current_value: '',
          explanation: issuesData.text_value
        }]);
      }

      setCorrectedData(correctedDataResult.text_value);
      setDownloadReady(true);
      setCurrentStep(3);

    } catch (error) {
      console.error('Processing error:', error);
      setIssues([{
        row_number: 'Error',
        field: 'System',
        issue_type: 'Processing Error',
        current_value: '',
        explanation: 'An error occurred while processing your files. Please try again.'
      }]);
      setCurrentStep(3);
    } finally {
      setProcessing(false);
    }
  };

  const downloadCorrectedData = () => {
    const blob = new Blob([correctedData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'corrected_contact_data.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedIssues = React.useMemo(() => {
    if (!sortConfig.key) return issues;
    
    return [...issues].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [issues, sortConfig]);

  const getSortIcon = (columnName) => {
    if (sortConfig.key !== columnName) {
      return '↕️';
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Contact Data Quality Checker
              </h1>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle dark mode"
                >
                  {darkMode ? '☀️' : '🌙'}
                </button>
                <button
                  onClick={resetApp}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep >= step 
                      ? 'bg-primary-600 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {step}
                  </div>
                  {step < 3 && (
                    <div className={`w-16 h-1 mx-2 ${
                      currentStep > step 
                        ? 'bg-primary-600' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: File Upload */}
          {currentStep === 1 && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
                  Upload Your Contact Data Files
                </h2>
                
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    dragOver 
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
                      : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="text-6xl mb-4">📄</div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Drag and drop your files here
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    or click to browse (CSV and PDF files supported)
                  </p>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".csv,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    aria-label="Choose files to upload"
                  />
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                  >
                    Choose Files
                  </button>
                </div>

                {files.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                      Selected Files:
                    </h3>
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <span className="text-gray-900 dark:text-white">{file.name}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      onClick={processFiles}
                      className="w-full mt-6 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                      aria-label="Start analyzing uploaded files"
                    >
                      Analyze Data Quality
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Processing */}
          {currentStep === 2 && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
                <div className="spinner mx-auto mb-6"></div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Processing Your Data
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Analyzing contact data for quality issues and generating corrections...
                </p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-primary-600 h-2 rounded-full animate-pulse" style={{width: '60%'}}></div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Issues Table */}
              {issues.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Data Quality Issues Found ({issues.length})
                    </h2>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="table table-striped table-hover w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                            onClick={() => handleSort('row_number')}
                            aria-label="Sort by row number"
                          >
                            Row {getSortIcon('row_number')}
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                            onClick={() => handleSort('field')}
                            aria-label="Sort by field"
                          >
                            Field {getSortIcon('field')}
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                            onClick={() => handleSort('issue_type')}
                            aria-label="Sort by issue type"
                          >
                            Issue Type {getSortIcon('issue_type')}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Current Value
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Explanation
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {sortedIssues.map((issue, index) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                              {issue.row_number}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              <span className="px-2 py-1 text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-full">
                                {issue.field}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {issue.issue_type}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white max-w-xs truncate">
                              {issue.current_value || 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-md">
                              {issue.explanation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Download Section */}
              {downloadReady && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Corrected Data Ready
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Your contact data has been cleaned and standardized. Download the corrected CSV file below.
                    </p>
                    <button
                      onClick={downloadCorrectedData}
                      className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg"
                      aria-label="Download corrected CSV file"
                    >
                      📥 Download Corrected CSV
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Debug Controls */}
          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => setShowRawResults(!showRawResults)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              aria-label="Toggle raw API results display"
            >
              {showRawResults ? 'Hide' : 'Show'} Raw API Results
            </button>
            <button
              onClick={deleteObjects}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              aria-label="Delete all API objects"
            >
              Delete API Objects
            </button>
          </div>

          {/* Raw Results Display */}
          {showRawResults && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                API Call Logs & Raw Results
              </h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {apiLogs.map((log) => (
                  <div key={log.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {log.method} {log.endpoint}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {log.data && (
                      <details className="mb-2">
                        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                          Request Data
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    )}
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                        Response
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                        {typeof log.response === 'string' ? log.response : JSON.stringify(log.response, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactDataQualityApp;
