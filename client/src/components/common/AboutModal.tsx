import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { FaTimes } from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface AboutModalRef {
  open: () => void;
  close: () => void;
}

const AboutModal = forwardRef<AboutModalRef>((_, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [markdownContent, setMarkdownContent] = useState<string>("");

  useImperativeHandle(ref, () => ({
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  }));

  useEffect(() => {
    // Load the markdown content
    fetch("/about.md")
      .then((response) => response.text())
      .then((content) => setMarkdownContent(content))
      .catch((error) => {
        console.error("Failed to load about content:", error);
        setMarkdownContent("# About\n\nFailed to load about content.");
      });
  }, []);

  return (
    <div className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box backdrop-blur-3xl bg-modal max-w-4xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">About</h2>
          <button className="btn btn-sm btn-circle btn-ghost" onClick={() => setIsOpen(false)} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-p:text-gray-300 prose-strong:text-gray-100 prose-code:bg-white/10 prose-code:text-gray-200 prose-pre:bg-white/10 prose-hr:border-white/20 prose-li:text-gray-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
        </div>
      </div>
      <div className="modal-backdrop" onClick={() => setIsOpen(false)} />
    </div>
  );
});

AboutModal.displayName = "AboutModal";

export default AboutModal;
