import { useEffect, useRef, useState } from 'react'

export interface FlagSelectOption {
  value: string
  label: string
  flag: string
  disabled?: boolean
}

interface FlagSelectProps {
  options: FlagSelectOption[]
  value: string
  onChange: (value: string) => void
  /** Bandeiras de país ficam melhores recortadas em círculo; emblemas de
   *  tier (asas/cristais, não retangulares) ficam distorcidos com esse
   *  recorte — `'contain'` mostra o ícone inteiro sem cortar. */
  iconShape?: 'circle' | 'contain'
}

/** Dropdown customizado com ícone por opção — um `<select>` nativo não
 *  consegue exibir imagem dentro de `<option>`, só texto, então essa é
 *  a única forma de mostrar ícone na lista aberta, não só no valor
 *  selecionado. */
function FlagSelect({ options, value, onChange, iconShape = 'circle' }: FlagSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)
  const iconClassName = iconShape === 'circle' ? 'flag-icon' : 'flag-icon flag-icon-contain'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="flag-select" ref={rootRef}>
      <button
        type="button"
        className="flag-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected && <img className={iconClassName} src={selected.flag} alt="" width={18} height={18} />}
        <span>{selected?.label ?? 'Selecionar'}</span>
        <span className="flag-select-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="flag-select-menu" role="listbox">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`flag-select-option ${o.value === value ? 'flag-select-option-active' : ''}`}
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                <img className={iconClassName} src={o.flag} alt="" width={18} height={18} />
                <span>{o.label}{o.disabled ? ' (em breve)' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FlagSelect
