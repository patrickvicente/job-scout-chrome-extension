import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Applied", value: "applied" },
  { label: "Interview", value: "interview" },
  { label: "Offer", value: "offer" },
  { label: "Rejected", value: "rejected" },
  { label: "Withdrawn", value: "withdrawn" },
  { label: "Archived", value: "archived" },
]

function SidePanel() {
  const [jobData, setJobData] = useState(null);
  const [status, setStatus] = useState(STATUS_OPTIONS[0].value);
  const [notes, setNotes] = useState("");

  const scrapeJobData = () => {
    chrome.runtime.sendMessage({ type: "GET_JOB_DATA" }, (response) => {
      setJobData(response && response.data);
    });
  }

  const handleSave = () => {
    // TODO: Save job data to backend
    console.log("Saving job data:", jobData);
  }

  useEffect(() => {
    scrapeJobData();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "EXTRACT_JOB_DATA" });
      }
    });

    const handleMessage = (message) => {
      if (message.type === "JOB_DATA") {
        setJobData(message.data);
      }
      if (message.type === "TAB_CHANGED") {
        chrome.runtime.sendMessage({ type: "GET_JOB_DATA" }, (response) => {
          setJobData(response && response.data);
        });
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, []);

  return (
    <div style={{ maxWidth: 400, margin: '24px auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      {jobData ? (
        <>
          <div style={{ borderBottom: '1px solid #eee', paddingBottom: 12, marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#2d3748' }}>{jobData.title || jobData.role || 'Not Found'}</h2>
            <div style={{ color: '#4a5568', fontSize: 16, marginTop: 4 }}><strong>Company:</strong> {jobData.company || 'Not Found'}</div>
            <div style={{ color: '#4a5568', fontSize: 16, marginTop: 2 }}><strong>Location:</strong> {jobData.location || 'Not Found'}</div>
            {jobData.salary && <div style={{ color: '#4a5568', fontSize: 16, marginTop: 2 }}><strong>Salary:</strong> {jobData.salary}</div>}
            {jobData.date_posted && <div style={{ color: '#4a5568', fontSize: 16, marginTop: 2 }}><strong>Date Posted:</strong> {jobData.date_posted}</div>}
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, color: '#2b6cb0', marginBottom: 8, fontSize: 15 }}>Application Details</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 500, color: '#2d3748' }}>
                Status:
                <select 
                  value={status} 
                  onChange={e => setStatus(e.target.value)}
                  style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e0', fontSize: 15 }}
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label style={{ fontWeight: 500, color: '#2d3748' }}>
                Notes:
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  style={{ width: '100%', marginTop: 4, borderRadius: 6, border: '1px solid #cbd5e0', padding: 8, fontSize: 15, resize: 'vertical' }}
                />
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              style={{
                background: 'linear-gradient(90deg, #667eea 0%, #5a67d8 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(90,103,216,0.08)'
              }}
              onClick={() => alert('AI Cover Letter generation coming soon!')}
            >
              Generate AI Cover Letter
            </button>
            <button
              style={{
                background: '#edf2f7',
                color: '#2d3748',
                border: '1px solid #cbd5e0',
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
              }}
              onClick={handleSave}
            >
              Save Job
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#b00', fontWeight: 'bold', marginBottom: 8 }}>
          No job information found
          <div style={{ color: '#555', fontWeight: 400, marginTop: 8 }}>
            Make sure you are in the job page to see values
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<SidePanel />); 