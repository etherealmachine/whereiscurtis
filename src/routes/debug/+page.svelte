<script lang="ts">
  let password = $state('');
  let sqlQuery = $state('');
  let sqlResult = $state('');
  let sqlError = $state('');
  let resetStatus = $state('');
  let uploadStatus = $state('');
  let uploadError = $state('');
  let fileInput: HTMLInputElement;
  let showResetSection = $state(false);
  let downloadStatus = $state('');
  let downloadError = $state('');

  async function runSql() {
    if (!password) {
      sqlError = 'Please enter the debug password';
      return;
    }
    if (!sqlQuery) {
      sqlError = 'Please enter an SQL query';
      return;
    }

    try {
      const response = await fetch(`/debug?password=${encodeURIComponent(password)}&sql=${encodeURIComponent(sqlQuery)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      sqlResult = JSON.stringify(result, null, 2);
      sqlError = '';
    } catch (error: unknown) {
      sqlError = error instanceof Error ? error.message : 'An unknown error occurred';
      sqlResult = '';
    }
  }

  async function resetDatabase() {
    if (!password) {
      resetStatus = 'Please enter the debug password';
      return;
    }

    try {
      const response = await fetch(`/debug?password=${encodeURIComponent(password)}&reset-database=true`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      resetStatus = await response.text();
    } catch (error: unknown) {
      resetStatus = error instanceof Error ? error.message : 'An unknown error occurred';
    }
  }

  async function uploadEvents() {
    if (!password) {
      uploadError = 'Please enter the debug password';
      return;
    }
    if (!fileInput.files || fileInput.files.length === 0) {
      uploadError = 'Please select a file to upload';
      return;
    }

    try {
      const file = fileInput.files[0];
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          const response = await fetch(`/debug?password=${encodeURIComponent(password)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          uploadStatus = await response.text();
          uploadError = '';
        } catch (error: unknown) {
          uploadError = error instanceof Error ? error.message : 'An unknown error occurred';
          uploadStatus = '';
        }
      };
      
      reader.readAsText(file);
    } catch (error: unknown) {
      uploadError = error instanceof Error ? error.message : 'An unknown error occurred';
      uploadStatus = '';
    }
  }

  async function downloadData() {
    if (!password) {
      downloadError = 'Please enter the debug password';
      return;
    }

    try {
      const response = await fetch(`/download?password=${encodeURIComponent(password)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'events.json';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      downloadStatus = 'Download successful';
      downloadError = '';
    } catch (error: unknown) {
      downloadError = error instanceof Error ? error.message : 'An unknown error occurred';
      downloadStatus = '';
    }
  }
</script>

<div class="debug-container">
  <h1>Debug Tools</h1>
  
  <div class="form-group">
    <label for="password">Debug Password:</label>
    <input type="password" id="password" bind:value={password} />
  </div>

  <div class="section">
    <h2>SQL Query</h2>
    <div class="form-group">
      <textarea bind:value={sqlQuery} placeholder="Enter SQL query"></textarea>
    </div>
    <button onclick={runSql}>Run Query</button>
    {#if sqlError}
      <div class="error">{sqlError}</div>
    {/if}
    {#if sqlResult}
      <pre class="result">{sqlResult}</pre>
    {/if}
  </div>

  <div class="section">
    <h2>Upload Events</h2>
    <div class="form-group">
      <input type="file" bind:this={fileInput} accept=".json" />
    </div>
    <button onclick={uploadEvents}>Upload Events</button>
    {#if uploadError}
      <div class="error">{uploadError}</div>
    {/if}
    {#if uploadStatus}
      <div class="status">{uploadStatus}</div>
    {/if}
  </div>

  <div class="section">
    <h2>Download Events</h2>
    <button onclick={downloadData}>Download Events</button>
    {#if downloadError}
      <div class="error">{downloadError}</div>
    {/if}
    {#if downloadStatus}
      <div class="status">{downloadStatus}</div>
    {/if}
  </div>

  <div class="section dangerous-section">
    <div 
      class="dangerous-header" 
      onclick={() => showResetSection = !showResetSection}
      onkeydown={(e) => e.key === 'Enter' && (showResetSection = !showResetSection)}
      tabindex="0"
      role="button"
    >
      <h2>Dangerous Operations</h2>
      <span class="toggle-icon">{showResetSection ? '▼' : '▶'}</span>
    </div>
    {#if showResetSection}
      <div class="dangerous-content">
        <p class="warning">⚠️ This will delete all data and reset the database to its initial state.</p>
        <button class="dangerous-button" onclick={resetDatabase}>Reset Database</button>
        {#if resetStatus}
          <div class="status">{resetStatus}</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .debug-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }

  h1 {
    margin-bottom: 30px;
  }

  .section {
    margin-bottom: 30px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  h2 {
    margin-top: 0;
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 15px;
  }

  label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
  }

  input[type="password"],
  input[type="file"],
  textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  textarea {
    height: 100px;
    resize: vertical;
  }

  button {
    padding: 8px 16px;
    background-color: #0078d4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover {
    background-color: #006cbd;
  }

  .error {
    color: #d32f2f;
    margin-top: 10px;
  }

  .status {
    color: #388e3c;
    margin-top: 10px;
  }

  .result {
    background-color: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    margin-top: 10px;
  }

  .dangerous-section {
    border-color: #d32f2f;
  }

  .dangerous-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .dangerous-header h2 {
    color: #d32f2f;
    margin-bottom: 0;
  }

  .toggle-icon {
    font-size: 20px;
    color: #d32f2f;
  }

  .dangerous-content {
    margin-top: 15px;
  }

  .warning {
    color: #d32f2f;
    margin-bottom: 15px;
  }

  .dangerous-button {
    background-color: #d32f2f;
  }

  .dangerous-button:hover {
    background-color: #b71c1c;
  }
</style>
