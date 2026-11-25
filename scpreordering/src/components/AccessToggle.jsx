import { useState } from 'react'
import toast from 'react-hot-toast'
import { setAccountActive } from '../lib/accounts'
import { ConfirmDialog } from './Modal'

export default function AccessToggle({ person, currentUserId, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const isSelf = person.id === currentUserId
  const active = person.is_active !== false

  const changeAccess = async (nextActive) => {
    setBusy(true)
    try {
      await setAccountActive(person.id, nextActive)
      toast.success(`${person.full_name} is now ${nextActive ? 'active' : 'revoked'}.`)
      setConfirming(false)
      onChanged?.()
    } catch (error) {
      toast.error(error.message || 'Could not change account access.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="row">
      <span className={`tag ${active ? 'sage' : 'tomato'}`}>{active ? 'Active' : 'Revoked'}</span>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        disabled={isSelf || busy}
        title={isSelf ? 'You cannot change your own access' : undefined}
        onClick={() => (active ? setConfirming(true) : changeAccess(true))}
      >
        {busy ? 'Saving…' : active ? 'Revoke' : 'Activate'}
      </button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => changeAccess(false)}
        title={`Revoke ${person.full_name}?`}
        message="This account will be signed out and cannot sign in again until you activate it. Their School ID and password stay the same."
        confirmLabel="Revoke access"
        cancelLabel="Keep active"
        busy={busy}
      />
    </div>
  )
}
