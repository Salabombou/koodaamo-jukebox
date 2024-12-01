import React, { forwardRef } from 'react';

interface ActionConfirmationModalProps {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default forwardRef<HTMLDialogElement, ActionConfirmationModalProps>(({ title, description, onConfirm, onCancel }, ref) => {
  return (
    <dialog
      ref={ref}
      className='modal'
    >
      <div className='modal-box'>
        <h3 className='font-bold text-3xl text-center'>{title}</h3>
        <p className='pt-4 text-xl text-center'>{description}</p>
        <div className='modal-action'>
        <form method='dialog' className='w-full flex justify-center space-x-4'>
          <button onClick={onConfirm} className='btn btn-outline btn-error'>Confirm</button>
          <button onClick={onCancel} className='btn btn-outline'>Cancel</button>
        </form>
        </div>
      </div>
      <form method='dialog' className='modal-backdrop'>
        <button>close</button>
      </form>
    </dialog>
  )
});