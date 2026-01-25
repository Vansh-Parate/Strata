import { useState, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadTest } from '../../services/upload'
import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Calendar } from '../ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

const EXAM_TYPES = ['JEE', 'NEET', 'CAT', 'UPSC', 'Custom']
const SOURCES = ['Manual', 'Coaching Institute', 'Platform Export']

export function UploadTestModal({ isOpen, onClose, onFileUploadSuccess }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [errors, setErrors] = useState({})
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  const [formData, setFormData] = useState({
    testName: '',
    testDate: null,
    examType: '',
    source: '',
    file: null,
    fileName: '',
  })
  const [calendarOpen, setCalendarOpen] = useState(false)

  const validation = useCallback(() => {
    const newErrors = {}
    
    if (!formData.testName.trim()) {
      newErrors.testName = 'Test name is required'
    }
    if (!formData.testDate) {
      newErrors.testDate = 'Test date is required'
    }
    if (!formData.examType) {
      newErrors.examType = 'Exam type is required'
    }
    if (!formData.source) {
      newErrors.source = 'Source is required'
    }
    if (!formData.file) {
      newErrors.file = 'CSV file is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  const mutation = useMutation({
    mutationFn: async ({ file, formData }) => {
      return uploadTest(file, {
        testName: formData.testName,
        testDate: formData.testDate,
        examType: formData.examType,
        source: formData.source,
      })
    },
    onSuccess: (response) => {
      setShowSuccessToast(true)
      
      // Call the callback with file data
      if (onFileUploadSuccess) {
        onFileUploadSuccess({
          file: formData.file,
          fileName: formData.fileName,
          testName: formData.testName,
          testDate: formData.testDate,
          examType: formData.examType,
          source: formData.source,
          response: response,
        })
      }
      
      // Invalidate queries to refresh dashboard
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      queryClient.invalidateQueries({ queryKey: ['attempts'] })
      queryClient.invalidateQueries({ queryKey: ['topic-mastery'] })
      queryClient.invalidateQueries({ queryKey: ['attempt-history'] })
      
      // Show validation errors if any
      if (response.data?.validationErrors && response.data.validationErrors.length > 0) {
        setErrors(prev => ({
          ...prev,
          fileValidation: response.data.validationErrors,
        }))
      }
      
      // Reset form and close modal after delay
      setTimeout(() => {
        handleClose()
      }, 2000)
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || error.message || 'Upload failed'
      const errorMessages = errorMessage.split('; ')
      setErrors({ ...errors, file: errorMessages[0] })
      if (errorMessages.length > 1) {
        setErrors(prev => ({ ...prev, fileValidation: errorMessages.slice(1) }))
      }
    },
  })

  const handleClose = () => {
    setFormData({
      testName: '',
      testDate: null,
      examType: '',
      source: '',
      file: null,
      fileName: '',
    })
    setErrors({})
    setIsDragging(false)
    setShowSuccessToast(false)
    onClose()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validation()) return
    
    mutation.mutate({ file: formData.file, formData })
  }

  const handleFileSelect = (file) => {
    if (!file) {
      setErrors({ ...errors, file: 'Please select a valid CSV file' })
      return
    }

    // Check if file is CSV by extension or MIME type
    const isCSV = file.name.toLowerCase().endsWith('.csv') || 
                  file.type === 'text/csv' || 
                  file.type === 'application/vnd.ms-excel' ||
                  file.type === 'text/plain'
    
    if (!isCSV) {
      setErrors({ ...errors, file: 'Please select a valid CSV file' })
      return
    }

    setFormData(prev => ({
      ...prev,
      file,
      fileName: file.name,
    }))
    setErrors({ ...errors, file: null })
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleRemoveFile = () => {
    setFormData(prev => ({
      ...prev,
      file: null,
      fileName: '',
    }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setErrors({ ...errors, file: null })
  }

  const downloadSampleCSV = () => {
    const sampleData = [
      ['question_id', 'topic', 'subtopic', 'difficulty', 'correct', 'time_taken', 'confidence', 'date'],
      ['1', 'Algebra', 'Linear Equations', 'Easy', 'true', '45', '4', '2024-01-15'],
      ['2', 'Geometry', 'Triangles', 'Medium', 'false', '120', '2', '2024-01-15'],
      ['3', 'Calculus', 'Derivatives', 'Hard', 'true', '180', '5', '2024-01-15'],
    ]
    
    const csvContent = sampleData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample-test-data.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const isFormValid = formData.testName && formData.testDate && formData.examType && formData.source && formData.file

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-xl border border-[#F2D5C8] shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#F4E0D5] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#2D3436]">Upload Test</h2>
            <button
              type="button"
              onClick={handleClose}
              className="text-[#78716C] hover:text-[#2D3436] transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="px-6 py-5 space-y-6">
              {/* Section 1: Test Details */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-[#2D3436]">Test Details</h3>
                
                <div className="space-y-4">
                  {/* Test Name */}
                  <div>
                    <label htmlFor="testName" className="block text-xs font-medium text-[#57534E] mb-1.5">
                      Test Name
                    </label>
                    <input
                      type="text"
                      id="testName"
                      value={formData.testName}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, testName: e.target.value }))
                        setErrors({ ...errors, testName: null })
                      }}
                      placeholder="Mock Test 7 – Quant Focus"
                      className={`w-full px-3 py-2 rounded-lg border ${
                        errors.testName ? 'border-red-300' : 'border-[#E7E5E4]'
                      } bg-white text-sm text-[#2D3436] placeholder:text-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#E17B5F]/20 focus:border-[#E17B5F] transition-colors`}
                    />
                    {errors.testName && (
                      <p className="mt-1 text-xs text-red-600">{errors.testName}</p>
                    )}
                  </div>

                  {/* Test Date */}
                  <div>
                    <label htmlFor="testDate" className="block text-xs font-medium text-[#57534E] mb-1.5">
                      Test Date
                    </label>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !formData.testDate && 'text-[#A8A29E]',
                            errors.testDate && 'border-red-300'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.testDate ? format(formData.testDate, 'PPP') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.testDate}
                          onSelect={(date) => {
                            setFormData(prev => ({ ...prev, testDate: date }))
                            setErrors({ ...errors, testDate: null })
                            if (date) {
                              setCalendarOpen(false)
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {errors.testDate && (
                      <p className="mt-1 text-xs text-red-600">{errors.testDate}</p>
                    )}
                  </div>

                  {/* Exam Type and Source in a row */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Exam Type */}
                    <div>
                      <label htmlFor="examType" className="block text-xs font-medium text-[#57534E] mb-1.5">
                        Exam Type
                      </label>
                      <Select
                        value={formData.examType}
                        onValueChange={(value) => {
                          setFormData(prev => ({ ...prev, examType: value }))
                          setErrors({ ...errors, examType: null })
                        }}
                      >
                        <SelectTrigger className={errors.examType ? 'border-red-300' : ''}>
                          <SelectValue placeholder="Select exam type" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXAM_TYPES.map(type => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.examType && (
                        <p className="mt-1 text-xs text-red-600">{errors.examType}</p>
                      )}
                    </div>

                    {/* Source */}
                    <div>
                      <label htmlFor="source" className="block text-xs font-medium text-[#57534E] mb-1.5">
                        Source
                      </label>
                      <Select
                        value={formData.source}
                        onValueChange={(value) => {
                          setFormData(prev => ({ ...prev, source: value }))
                          setErrors({ ...errors, source: null })
                        }}
                      >
                        <SelectTrigger className={errors.source ? 'border-red-300' : ''}>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {SOURCES.map(source => (
                            <SelectItem key={source} value={source}>
                              {source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.source && (
                        <p className="mt-1 text-xs text-red-600">{errors.source}</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Divider */}
              <div className="border-t border-[#F4E0D5]" />

              {/* Section 2: File Upload */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-[#2D3436]">File Upload</h3>
                
                {!formData.fileName ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      isDragging
                        ? 'border-[#E17B5F] bg-[#E17B5F]/5'
                        : errors.file
                        ? 'border-red-300 bg-red-50/30'
                        : 'border-[#E7E5E4] bg-[#F5F5F4]/30'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mx-auto size-10 text-[#78716C] mb-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <p className="text-sm text-[#57534E] mb-2">
                      Drag and drop your CSV file here
                    </p>
                    <p className="text-xs text-[#78716C] mb-4">or</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg bg-white border border-[#E7E5E4] px-4 py-2 text-xs font-medium text-[#57534E] hover:bg-[#F5F5F4] transition-colors"
                    >
                      Browse file
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 rounded-lg border border-[#E7E5E4] bg-[#F5F5F4]/30">
                    <div className="flex items-center gap-3">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-5 text-[#78716C]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-[#2D3436]">{formData.fileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="text-[#78716C] hover:text-red-600 transition-colors"
                      aria-label="Remove file"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                {errors.file && (
                  <div className="space-y-1">
                    <p className="text-xs text-red-600">{errors.file}</p>
                    {errors.fileValidation && errors.fileValidation.map((msg, idx) => (
                      <p key={idx} className="text-xs text-red-600">{msg}</p>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={downloadSampleCSV}
                  className="text-xs text-[#E17B5F] hover:text-[#D06A4E] transition-colors underline"
                >
                  Download sample CSV format
                </button>
              </section>

              {/* Divider */}
              <div className="border-t border-[#F4E0D5]" />

              {/* Section 3: Actions */}
              <section className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!isFormValid || mutation.isPending}
                >
                  {mutation.isPending ? 'Analyzing test…' : 'Upload & Analyze'}
                </Button>
              </section>
            </div>
          </form>
        </div>
      </div>

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
          <div className="rounded-lg border border-[#E7E5E4] bg-white px-4 py-3 shadow-lg flex items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-5 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-[#2D3436]">Test analyzed. Insights updated.</p>
          </div>
        </div>
      )}
    </>
  )
}
