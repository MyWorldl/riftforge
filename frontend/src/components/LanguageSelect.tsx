import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

interface LanguageOption {
  value: string
  label: string
  disabled?: boolean
}

// Pedido do usuário: seletor de idioma no top bar, entre o tema e as
// configurações — só PT-BR funciona por enquanto (o site inteiro é
// escrito em português direto no código, nunca teve i18n de verdade),
// o resto fica marcado "em breve" até existir tradução real.
const LANGUAGES: LanguageOption[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English', disabled: true },
  { value: 'es-ES', label: 'Español', disabled: true },
]

function IconGlobe() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path
        d="M2 8h12M8 1.8c1.8 1.7 2.8 4 2.8 6.2s-1 4.5-2.8 6.2c-1.8-1.7-2.8-4-2.8-6.2S6.2 3.5 8 1.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

/** Dropdown de idioma no top bar — mesmo padrão de interação de
 *  `FlagSelect.tsx` (combobox ARIA, teclado completo, fecha ao clicar
 *  fora), só que o trigger é um ícone só (`.icon-toggle`, mesmo botão
 *  de tema/configurações) em vez do campo com rótulo usado nos
 *  filtros. Sem persistência/troca de idioma de verdade ainda — só a
 *  escolha visual (`value`), já que só PT-BR está habilitado. */
function LanguageSelect() {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [value, setValue] = useState('pt-BR')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()
  const selectedIndex = LANGUAGES.findIndex((o) => o.value === value)
  const selected = LANGUAGES.find((o) => o.value === value)

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
    for (let step = 0; step < LANGUAGES.length; step++) {
      i = (i + dir + LANGUAGES.length) % LANGUAGES.length
      if (!LANGUAGES[i].disabled) return i
    }
    return from
  }

  function commit(index: number) {
    const option = LANGUAGES[index]
    if (!option || option.disabled) return
    setValue(option.value)
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
    <div className="lang-select" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-toggle"
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        title={`Idioma: ${selected?.label ?? ''}`}
        aria-label={`Idioma: ${selected?.label ?? ''}`}
      >
        <IconGlobe />
      </button>
      {open && (
        <ul className="lang-select-menu" role="listbox" id={listboxId}>
          {LANGUAGES.map((o, index) => (
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
                <span>{o.label}{o.disabled ? ' (em breve)' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default LanguageSelect
