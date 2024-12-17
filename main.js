import { MDConnection, getAsyncDuckDb } from '@motherduck/wasm-client';

const APP_URL = new URL(window.location);
APP_URL.hash = '#tokenInClipboard=true';

class MotherDuckFileBrowser {

    static buildTableFromQueryResult (data) {
        const columns = data.columnNames(),
              rows = data.toRows();

        const table = document.createElement('table');
        table.innerHTML = `<thead><tr></tr></thead><tbody></tbody>`;

        table.querySelector('thead tr').innerHTML = columns.map(
            column => `<th>${column}</th>`
        ).join('\n');

        const tbody = table.querySelector('tbody');
        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = columns.map(
                column => row[column] === null ? '' : row[column].toString()
            ).map(
                cell => `<td>${cell}</td>`
            ).join('\n');
            tbody.append(tr);
        });

        return table;
    }

    static async promptForToken () {
        const modal = document.createElement('sl-dialog');
        modal.label = "MotherDuck connection";
        modal.innerHTML = `
<form>
  <a href="https://app.motherduck.com/token-request?appName=File+browser&returnTo=${encodeURIComponent(APP_URL)}">Get a token (this won‘t be saved anywhere, don’t worry)</a>
  <sl-input label="MotherDuck token"
            type="password" 
            name="token"
            password-toggle></sl-input>
  <button type="submit">Save settings</button>
</form>
        `;
        modal.open = true;
        document.body.append(modal);

        modal.querySelector('form').addEventListener('submit', async e => {
            e.preventDefault();
            modal.open = false;
            const form = new FormData(e.target),
                  mdToken = form.get('token');

            const dropzone = document.createElement('div');
            dropzone.classList.add('dropzone');
            dropzone.textContent = "Initializing a database, hang on...";
            document.body.append(dropzone);
            
            const motherduck = MDConnection.create({
                mdToken
            });
            const db = await getAsyncDuckDb({
                mdToken
            });

            dropzone.textContent = "Ready when you are! Drop a CSV file and I'll tell you about it.";

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, e => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, () => {
                    dropzone.style.backgroundColor = '#f0f0f0';
                    dropzone.style.borderColor = '#999';
                });
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, () => {
                    dropzone.style.backgroundColor = '';
                    dropzone.style.borderColor = '#ccc';
                });
            });

            // Handle the actual file drop
            dropzone.addEventListener('drop', async e => {
                const file = e.dataTransfer.files[0];
                if (!file || !file.name.toLowerCase().endsWith('.csv')) {
                    dropzone.textContent = 'Please drop a CSV file';
                    dropzone.classList.add('error');
                    return;
                }

                try {
                    dropzone.classList.remove('error');
                    dropzone.textContent = 'Processing...';
                    const buffer = new Uint8Array(await file.arrayBuffer());
                    await db.registerFileBuffer(file.name, buffer);
                    
                    // Get file info
                    const [sampleRows, countQuery] = await Promise.all([
                        motherduck.evaluateQuery(`select * from '${file.name}' limit 25`),
                        motherduck.evaluateQuery(`select count(*) as num_rows from '${file.name}'`)
                    ]);

                    dropzone.textContent = `Loaded ${file.name}`;
                    dropzone.append(document.createElement('br'));
                    const span = document.createElement('span');
                    span.textContent = `${countQuery.data.toRows()[0].num_rows} rows - showing the first few below as a preview`;
                    dropzone.append(span);

                    const table = MotherDuckFileBrowser.buildTableFromQueryResult(sampleRows.data);
                    /* Make sure we're cleaning up any old closed drawers first */
                    Array.from(document.querySelectorAll('.query-result')).forEach(el => el.remove());
                    
                    const sample = document.createElement('div');
                    sample.classList.add('query-result');
                    sample.open = true;
                    sample.style.setProperty('--size', '75vw');
                    sample.append(table);
                    document.body.append(sample);
                } catch (err) {
                    dropzone.classList.add('error');
                    dropzone.textContent = `Error: ${err.message}`;
                }
            });
        });

        if (window.location.hash === '#tokenInClipboard=true') {
            window.location.hash = '#';

            if (navigator.clipboard.readText) {
                modal.querySelector('[name=token]').value = await navigator.clipboard.readText();
                modal.querySelector('a').remove();
            } else {
                /* If the browser doesn't let us read from the clipboard directly,
                   we'll tell the user to paste it. */
                modal.querySelector('a').textContent = 'Paste the token from your clipboard below.';
                modal.querySelector('a').href = '';
            }
        }        
    }
};

document.addEventListener('DOMContentLoaded', MotherDuckFileBrowser.promptForToken);
