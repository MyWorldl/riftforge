import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

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
 *  selecionado.
 *
 *  Item novo (revisão técnica §7.4): navegação por teclado no padrão
 *  ARIA "select-only combobox" — o trigger é o `role="combobox"`, o foco
 *  real nunca sai dele (`aria-activedescendant` aponta pra opção ativa),
 *  setas pulam opções `disabled`, Enter/Espaço seleciona, Escape fecha. */
function FlagSelect({ options, value, onChange, iconShape = 'circle' }: FlagSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()
  const selected = options.find((o) => o.value === value)
  const selectedIndex = options.findIndex((o) => o.value === value)
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

  function openAt(index: number) {
    setActiveIndex(index >= 0 ? index : 0)
    setOpen(true)
  }

  function nextEnabledIndex(from: number, dir: 1 | -1): number {
    let i = from
    for (let step = 0; step < options.length; step++) {
      i = (i + dir + options.length) % options.length
      if (!options[i].disabled) return i
    }
    return from
  }

  function commit(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openAt(selectedIndex)
      } else {
        setActiveIndex((current) => nextEnabledIndex(current, event.key === 'ArrowDown' ? 1 : -1))
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) {
        commit(activeIndex)
      } else {
        openAt(selectedIndex)
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="flag-select" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="flag-select-trigger"
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
      >
        {selected && <img className={iconClassName} src={selected.flag} alt="" width={18} height={18} />}
        <span>{selected?.label ?? 'Selecionar'}</span>
        <span className="flag-select-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="flag-select-menu" role="listbox" id={listboxId}>
          {options.map((o, index) => (
            <li key={o.value}>
              <button
                type="button"
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={o.value === value}
                className={`flag-select-option ${o.value === value ? 'flag-select-option-active' : ''} ${index === activeIndex ? 'flag-select-option-focus' : ''}`}
                disabled={o.disabled}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  commit(index)
                  triggerRef.current?.focus()
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
