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

const CATEGORY_OPTIONS = [
  { label: "Other", value: "other" },
  { label: "Software Engineer", value: "software-engineer" },
  { label: "Data Scientist", value: "data-scientist" },
  { label: "Product Manager", value: "product-manager" },
  { label: "Designer", value: "designer" },
  { label: "Marketing", value: "marketing" },
  { label: "Sales", value: "sales" },
  { label: "Finance", value: "finance" },
  { label: "HR", value: "hr" },
  { label: "Legal", value: "legal" },
]

function SidePanel() {
  const [jobData, setJobData] = useState(null);
  const [status, setStatus] = useState(STATUS_OPTIONS[0].value);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0].value);
  const [isLoading, setIsLoading] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCoverLetterModal, setShowCoverLetterModal] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [showCoverLetterForm, setShowCoverLetterForm] = useState(false);
  const [coverLetterTone, setCoverLetterTone] = useState("professional");
  const [coverLetterFocusAreas, setCoverLetterFocusAreas] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [savedJobs, setSavedJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  const scrapeJobData = () => {
    chrome.runtime.sendMessage({ type: "GET_JOB_DATA" }, (response) => {
      setJobData(response && response.data);
    });
  }

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000); // Auto-hide after 3 seconds
  };

  const capitalizeFirstLetter = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getStatusLabel = (statusValue) => {
    const statusOption = STATUS_OPTIONS.find(option => option.value === statusValue);
    return statusOption ? statusOption.label : capitalizeFirstLetter(statusValue);
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const fetchSavedJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const response = await fetch(`${MCP_SERVER_URL}/jobs?limit=20&offset=0`);
      if (response.ok) {
        const result = await response.json();
        setSavedJobs(result.jobs || result || []);
      } else {
        console.error('Failed to fetch saved jobs:', response.status);
        setSavedJobs([]);
      }
    } catch (error) {
      console.error('Error fetching saved jobs:', error);
      setSavedJobs([]);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  console.log("savedJobs", savedJobs);

  const refreshJobData = async () => {
    // Clear current job data first
    setJobData(null);
    
    // Trigger content script to re-extract data
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "EXTRACT_JOB_DATA" });
      }
    });
    
    // Wait a bit then get the latest data
    setTimeout(() => {
      scrapeJobData();
    }, 1000); // Increased delay to ensure content script has processed
  };

  const MCP_SERVER_URL = 'http://localhost:8000'; // Your MCP server URL

  const handleSave = async () => {
    setIsLoading(true);
    const payload = {
      job: {
        title: jobData.title || jobData.role,
        company: jobData.company,
        location: jobData.location,
        description: jobData.description,
        salary: jobData.salary,
        posted_date: jobData.date_posted,
        url: jobData.url,
        source: jobData.source,
        category: category,
        method: "manual",
      },
      application: {
        status: status,
        notes: notes,
      }
    }

    try {
      console.log('Sending payload to:', `${MCP_SERVER_URL}/jobs/import-from-extension`);
      console.log('Payload:', payload);
      
      const response = await fetch(`${MCP_SERVER_URL}/jobs/import-from-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      const result = await response.json();
      console.log('Response result:', result);
      console.log('Response result type:', typeof result);
      console.log('Response result keys:', Object.keys(result || {}));
      console.log('Result.job:', result?.job);
      
      if (response.ok) {
        // Safely access the job ID with fallbacks
        const jobId = result?.job?.id || result?.id || result?.job_id || 'Unknown';
        showMessage('success', `Job saved successfully! ID: ${jobId}`);
        // Refresh job data to update existence status
        refreshJobData();
      } else {
        showMessage('error', `Error saving job: ${result.message || result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving job:', error);
      
      // Provide more specific error messages
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        showMessage('error', 'Failed to connect to server. Please check if your MCP server is running on http://localhost:8000');
      } else if (error.name === 'SyntaxError') {
        showMessage('error', 'Invalid response from server. Please check server logs.');
      } else {
        showMessage('error', `Failed to save job: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateApplication = async () => {
    if (!jobData.existingApplication?.id) {
      showMessage('error', 'No existing application found to update');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${MCP_SERVER_URL}/applications/${jobData.existingApplication.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: status,
          notes: notes,
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        showMessage('success', 'Application updated successfully!');
        // Refresh job data
        refreshJobData();
        setShowUpdateForm(false);
      } else {
        showMessage('error', `Error updating application: ${result.message || result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating application:', error);
      showMessage('error', `Failed to update application: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteApplication = async () => {
    if (!jobData.existingApplication?.id) {
      showMessage('error', 'No existing application found');
      return;
    }

    setIsLoading(true);
    try {
      // Delete job (cascades to applications
      const response = await fetch(`http://localhost:8000/jobs/${jobData.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        showMessage('success', 'Job Application deleted successfully!');
        // Refresh job data
        refreshJobData();
        setShowUpdateForm(false);
        setShowDeleteConfirm(false);
      } else {
        const result = await response.json();
        showMessage('error', `Error deleting job application: ${result.message || result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting application:', error);
      showMessage('error', `Failed to delete application: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const generateCoverLetter = async () => {
    if (!jobData) {
      showMessage('error', 'No job data available');
      return;
    }

    // Check if we have a job ID (job must be saved first)
    if (!jobData.id && !jobData.existingJob?.id) {
      showMessage('error', 'Please save the job first before generating a cover letter');
      return;
    }

    // Check if we have a resume ID
    if (!resumeId.trim()) {
      showMessage('error', 'Please enter a resume ID');
      return;
    }

    setIsGeneratingCoverLetter(true);
    try {
      const jobId = jobData.id || jobData.existingJob?.id;
      
      const response = await fetch(`${MCP_SERVER_URL}/mcp/cover-letter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: jobId,
          resume_id: resumeId,
          style: coverLetterTone,
          focus_areas: coverLetterFocusAreas || 'technical skills, leadership'
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        setCoverLetter(result.cover_letter || result.text || result.content || 'Cover letter generated successfully!');
        setShowCoverLetterModal(true);
        setShowCoverLetterForm(false);
      } else {
        showMessage('error', `Error generating cover letter: ${result.message || result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error generating cover letter:', error);
      showMessage('error', `Failed to generate cover letter: ${error.message}`);
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showMessage('success', 'Cover letter copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      showMessage('error', 'Failed to copy to clipboard');
    }
  };

  const injectIntoLinkedIn = () => {
    // Send message to content script to inject into LinkedIn's textarea
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: "INJECT_COVER_LETTER", 
          coverLetter: coverLetter 
        });
        showMessage('success', 'Cover letter injected into LinkedIn form!');
        setShowCoverLetterModal(false);
      }
    });
  };

  useEffect(() => {
    scrapeJobData();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "EXTRACT_JOB_DATA" });
      }
    });

    const handleMessage = (message) => {
      if (message.type === "JOB_DATA") {
        console.log("Received updated job data:", message.data);
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

  // Fetch saved jobs when no job data is available
  useEffect(() => {
    if (!jobData) {
      fetchSavedJobs();
    }
  }, [jobData]);

  // Initialize status and notes with existing values when job exists, or reset to defaults
  useEffect(() => {
    if (jobData?.exists && jobData?.existingApplication) {
      setStatus(jobData.existingApplication.status || STATUS_OPTIONS[0].value);
      setNotes(jobData.existingApplication.notes || "");
    } else {
      // Reset to default values when job doesn't exist or has no existing application
      setStatus(STATUS_OPTIONS[0].value);
      setNotes("");
      setCategory(CATEGORY_OPTIONS[0].value);
    }
  }, [jobData]);

  return (
    <div style={{ maxWidth: 400, margin: '24px auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      {/* Message Display */}
      {message.text && (
        <div style={{
          background: message.type === 'success' ? '#f0fff4' : '#fed7d7',
          border: `1px solid ${message.type === 'success' ? '#68d391' : '#fc8181'}`,
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          color: message.type === 'success' ? '#22543d' : '#c53030',
          fontSize: 14,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{message.text}</span>
          <button
            onClick={() => setMessage({ type: '', text: '' })}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              color: 'inherit',
              marginLeft: 8
            }}
          >
            ×
          </button>
        </div>
      )}
      
      {jobData ? (
        <>
          <div style={{ borderBottom: '1px solid #eee', paddingBottom: 12, marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#2d3748' }}>{jobData.title || 'Not Found'}</h2>
            <div style={{ color: '#4a5568', fontSize: 16, marginTop: 4 }}><strong>Company:</strong> {jobData.company || 'Not Found'}</div>
            <div style={{ color: '#4a5568', fontSize: 16, marginTop: 2 }}><strong>Location:</strong> {jobData.location || 'Not Found'}</div>
            {jobData.salary && <div style={{ color: '#4a5568', fontSize: 16, marginTop: 2 }}><strong>Salary:</strong> {jobData.salary}</div>}
            {jobData.date_posted && <div style={{ color: '#4a5568', fontSize: 16, marginTop: 2 }}><strong>Date Posted:</strong> {jobData.date_posted}</div>}
            {jobData.source && <div style={{ color: '#4a5568', fontSize: 16, marginTop: 2 }}><strong>Source:</strong> {jobData.source.charAt(0).toUpperCase() + jobData.source.slice(1)}</div>}
          </div>
          
          {/* Show existing application status if job exists */}
          {jobData.exists && jobData.existingApplication && (
            <div style={{ 
              background: 'linear-gradient(135deg, #f0fff4 0%, #e6fffa 100%)', 
              border: '1px solid #68d391', 
              borderRadius: 12, 
              padding: 16, 
              marginBottom: 20,
              boxShadow: '0 2px 8px rgba(104, 211, 145, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ 
                  background: '#48bb78', 
                  borderRadius: '50%', 
                  width: 24, 
                  height: 24, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginRight: 8
                }}>
                  <span style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>✓</span>
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#22543d' }}>Already Saved</h3>
              </div>
              
              <div style={{ color: '#22543d', fontSize: 14, lineHeight: 1.6 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>Status:</strong> 
                  <span style={{ 
                    background: jobData.existingApplication.status === 'applied' ? '#48bb78' : '#ed8936', 
                    color: 'white', 
                    padding: '4px 8px', 
                    borderRadius: 6, 
                    fontSize: 12, 
                    fontWeight: 600,
                    marginLeft: 8
                  }}>
                    {getStatusLabel(jobData.existingApplication.status) || 'Unknown'}
                  </span>
                </div>
                
                {jobData.existingApplication.applied_at && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Applied Date:</strong> {formatDate(jobData.existingApplication.applied_at)}
                  </div>
                )}
                
                {jobData.existingApplication.created_at && !jobData.existingApplication.applied_at && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Saved Date:</strong> {formatDate(jobData.existingApplication.created_at)}
                  </div>
                )}
                
                {jobData.existingApplication.notes && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>Notes:</strong> {jobData.existingApplication.notes}
                  </div>
                )}
                
                {!showUpdateForm && (
                  <button
                    onClick={() => setShowUpdateForm(true)}
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #5a67d8 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(102, 126, 234, 0.2)'
                    }}
                  >
                    Update Application
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Show update form only when user wants to update */}
          {showUpdateForm && jobData.exists && (
            <div style={{ 
              background: '#f7fafc', 
              border: '1px solid #e2e8f0', 
              borderRadius: 12, 
              padding: 16, 
              marginBottom: 20 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#2d3748' }}>Update Application</h3>
                <button
                  onClick={() => setShowUpdateForm(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 18,
                    cursor: 'pointer',
                    color: '#a0aec0'
                  }}
                >
                  ×
                </button>
              </div>
              
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                  Status:
                </label>
                <select 
                  value={status} 
                  onChange={e => setStatus(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '8px 12px', 
                    borderRadius: 6, 
                    border: '1px solid #cbd5e0', 
                    fontSize: 14 
                  }}
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                  Notes:
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  style={{ 
                    width: '100%', 
                    borderRadius: 6, 
                    border: '1px solid #cbd5e0', 
                    padding: 8, 
                    fontSize: 14, 
                    resize: 'vertical' 
                  }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleUpdateApplication}
                  disabled={isLoading}
                  style={{
                    background: '#48bb78',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1
                  }}
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isLoading}
                  style={{
                    background: '#f56565',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowUpdateForm(false)}
                  style={{
                    background: '#e2e8f0',
                    color: '#4a5568',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
              
              {/* Delete Confirmation */}
              {showDeleteConfirm && (
                <div style={{
                  background: '#fed7d7',
                  border: '1px solid #fc8181',
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 12,
                  color: '#c53030'
                }}>
                  <div style={{ marginBottom: 8, fontWeight: 600 }}>
                    Are you sure you want to delete this application?
                  </div>
                  <div style={{ marginBottom: 12, fontSize: 14 }}>
                    This action cannot be undone.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleDeleteApplication}
                      disabled={isLoading}
                      style={{
                        background: '#e53e3e',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      style={{
                        background: '#e2e8f0',
                        color: '#4a5568',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Show save form for new jobs */}
          {!jobData.exists && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, color: '#2b6cb0', marginBottom: 16, fontSize: 16 }}>Save New Application</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                  Status:
                </label>
                <select 
                  value={status} 
                  onChange={e => setStatus(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '8px 12px', 
                    borderRadius: 6, 
                    border: '1px solid #cbd5e0', 
                    fontSize: 14 
                  }}
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                  Category:
                </label>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '8px 12px', 
                    borderRadius: 6, 
                    border: '1px solid #cbd5e0', 
                    fontSize: 14 
                  }}
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                  Notes:
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  style={{ 
                    width: '100%', 
                    borderRadius: 6, 
                    border: '1px solid #cbd5e0', 
                    padding: 8, 
                    fontSize: 14, 
                    resize: 'vertical' 
                  }}
                />
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              style={{
                background: 'linear-gradient(90deg, #667eea 0%, #5a67d8 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: 15,
                cursor: isGeneratingCoverLetter ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 4px rgba(90,103,216,0.08)',
                opacity: isGeneratingCoverLetter ? 0.6 : 1
              }}
              onClick={() => setShowCoverLetterForm(true)}
              disabled={isGeneratingCoverLetter}
            >
              {isGeneratingCoverLetter ? 'Generating...' : 'Generate AI Cover Letter'}
            </button>
            {!jobData.exists && (
              <button
                style={{
                  background: '#edf2f7',
                  color: '#2d3748',
                  border: '1px solid #cbd5e0',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  opacity: isLoading ? 0.6 : 1
                }}
                onClick={handleSave}
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Job'}
              </button>
            )}
            <button
              style={{
                background: '#a0aec0',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
              onClick={refreshJobData}
              disabled={isLoading}
              title="Refresh job data"
            >
              ↻
            </button>
          </div>
        </>
      ) : (
        <div style={{ padding: '0 8px' }}>
          {/* Homepage Header */}
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #5a67d8 100%)', 
            borderRadius: 12, 
            padding: 20, 
            marginBottom: 20,
            color: 'white',
            textAlign: 'center'
          }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 700 }}>Job Scout</h2>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
              Your personal job application tracker
            </p>
          </div>

          {/* Saved Jobs Section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: 16 
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#2d3748' }}>
                Recent Saved Jobs
              </h3>
              <button
                onClick={fetchSavedJobs}
                disabled={isLoadingJobs}
                style={{
                  background: '#e2e8f0',
                  color: '#4a5568',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isLoadingJobs ? 'not-allowed' : 'pointer',
                  opacity: isLoadingJobs ? 0.6 : 1
                }}
                title="Refresh saved jobs"
              >
                {isLoadingJobs ? 'Loading...' : '↻'}
              </button>
            </div>

            {isLoadingJobs ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#718096' }}>
                Loading your saved jobs...
              </div>
            ) : savedJobs.length > 0 ? (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {savedJobs.map((job, index) => (
                  <div
                    key={job.id || index}
                    style={{
                      background: '#f7fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 12,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#edf2f7';
                      e.target.style.borderColor = '#cbd5e0';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#f7fafc';
                      e.target.style.borderColor = '#e2e8f0';
                    }}
                    onClick={() => {
                      if (job.url) {
                        chrome.tabs.create({ url: job.url });
                      }
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'flex-start',
                      marginBottom: 8
                    }}>
                      <h4 style={{ 
                        margin: 0, 
                        fontSize: 16, 
                        fontWeight: 600, 
                        color: '#2d3748',
                        lineHeight: 1.3
                      }}>
                        {job.title || job.role || 'Untitled Position'}
                      </h4>
                      <span style={{
                        background: job.applications?.[0]?.status === 'applied' ? '#48bb78' : '#ed8936',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {getStatusLabel(job.applications?.[0]?.status) || 'Pending'}
                      </span>
                    </div>
                    
                    <div style={{ color: '#4a5568', fontSize: 14, marginBottom: 6 }}>
                      <strong>{job.company || 'Unknown Company'}</strong>
                    </div>
                    
                    {job.location && (
                      <div style={{ color: '#718096', fontSize: 13, marginBottom: 6 }}>
                        📍 {job.location}
                      </div>
                    )}
                    
                    {job.applications?.[0]?.applied_at && (
                      <div style={{ color: '#718096', fontSize: 12 }}>
                        Applied: {formatDate(job.applications[0].applied_at)}
                      </div>
                    )}
                    
                    {job.applications?.[0]?.created_at && !job.applications[0].applied_at && (
                      <div style={{ color: '#718096', fontSize: 12 }}>
                        Saved: {formatDate(job.applications[0].created_at)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: 40, 
                color: '#718096',
                background: '#f7fafc',
                borderRadius: 8,
                border: '1px dashed #cbd5e0'
              }}>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                  No saved jobs yet
                </div>
                <div style={{ fontSize: 14, color: '#a0aec0' }}>
                  Visit a job page to save your first application
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ 
            background: '#f7fafc', 
            border: '1px solid #e2e8f0', 
            borderRadius: 8, 
            padding: 16 
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#2d3748' }}>
              Quick Actions
            </h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => chrome.tabs.create({ url: 'https://www.linkedin.com/jobs/' })}
                style={{
                  background: '#0077b5',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                LinkedIn Jobs
              </button>
              <button
                onClick={() => chrome.tabs.create({ url: 'https://www.indeed.com/' })}
                style={{
                  background: '#003a9b',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Indeed
              </button>
              <button
                onClick={() => chrome.tabs.create({ url: 'https://www.glassdoor.com/Job/' })}
                style={{
                  background: '#0caa41',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Glassdoor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cover Letter Form Modal */}
      {showCoverLetterForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#2d3748' }}>Generate AI Cover Letter</h3>
              <button
                onClick={() => setShowCoverLetterForm(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#a0aec0'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                Resume ID:
              </label>
              <input
                type="text"
                value={resumeId}
                onChange={e => setResumeId(e.target.value)}
                placeholder="Enter your resume ID"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e0',
                  fontSize: 14
                }}
              />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                Tone:
              </label>
              <select
                value={coverLetterTone}
                onChange={e => setCoverLetterTone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e0',
                  fontSize: 14
                }}
              >
                <option value="professional">Professional</option>
                <option value="creative">Creative</option>
                <option value="enthusiastic">Enthusiastic</option>
                <option value="confident">Confident</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
              </select>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 500, color: '#2d3748', display: 'block', marginBottom: 4 }}>
                Focus Areas:
              </label>
              <textarea
                value={coverLetterFocusAreas}
                onChange={e => setCoverLetterFocusAreas(e.target.value)}
                placeholder="e.g., technical skills, leadership, project management"
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: 6,
                  border: '1px solid #cbd5e0',
                  padding: 8,
                  fontSize: 14,
                  resize: 'vertical'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCoverLetterForm(false)}
                style={{
                  background: '#e2e8f0',
                  color: '#4a5568',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={generateCoverLetter}
                disabled={isGeneratingCoverLetter}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #5a67d8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isGeneratingCoverLetter ? 'not-allowed' : 'pointer',
                  opacity: isGeneratingCoverLetter ? 0.6 : 1
                }}
              >
                {isGeneratingCoverLetter ? 'Generating...' : 'Generate Cover Letter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cover Letter Modal */}
      {showCoverLetterModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#2d3748' }}>AI Generated Cover Letter</h3>
              <button
                onClick={() => setShowCoverLetterModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#a0aec0'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                rows={12}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  padding: 12,
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: 'vertical',
                  fontFamily: 'Inter, sans-serif'
                }}
                placeholder="Your AI-generated cover letter will appear here..."
              />
            </div>
            
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => copyToClipboard(coverLetter)}
                style={{
                  background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(72, 187, 120, 0.2)'
                }}
              >
                Copy to Clipboard
              </button>
              <button
                onClick={injectIntoLinkedIn}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #5a67d8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(102, 126, 234, 0.2)'
                }}
              >
                Inject into LinkedIn
              </button>
              <button
                onClick={() => setShowCoverLetterModal(false)}
                style={{
                  background: '#e2e8f0',
                  color: '#4a5568',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<SidePanel />); 