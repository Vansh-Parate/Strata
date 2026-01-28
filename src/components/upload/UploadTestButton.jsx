import { useState } from 'react'
import { UploadTestModal } from './UploadTestModal'

export function UploadTestButton({ onFileUploadSuccess }) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-[#E17B5F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#D06A4E] transition-colors shadow-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
        </svg>
        Upload Test
      </button>
      <UploadTestModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onFileUploadSuccess={onFileUploadSuccess} />
    </>
  )
}

