import Modal from './Modal.jsx';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message }) {
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirmar'}>
      <p className="text-gray-600 text-sm mb-4">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className="px-4 py-2 text-sm text-white bg-alert-danger rounded-lg hover:bg-red-700"
        >
          Confirmar
        </button>
      </div>
    </Modal>
  );
}
