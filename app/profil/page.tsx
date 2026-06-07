'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  type DemoBaby,
  type DemoBabySexe,
  type DemoParcours,
  getDemoBaby,
  getOrCreateSessionId,
  loadPoidsActuel,
  loadPoidsNaissance,
  saveDemoBaby,
  saveWeightLocalStorage,
} from '@/lib/demo'
import { BabyAvatar } from '@/components/BabyAvatar'
import {
  loadBabyAvatar,
  loadAuthAvatarUrl,
  saveBabyAvatar,
  uploadAuthAvatar,
} from '@/lib/avatar'
import { fetchEvents as fetchEventsFromDb } from '@/lib/events'
import {
  INTOLERANCE_OPTIONS,
  TYPE_LAIT_OPTIONS,
  type Intolerance,
  type TypeLait,
} from '@/lib/couche'
import { computeProfileStats, type ProfileStats } from '@/lib/profile-stats'
import { supabase } from '@/lib/supabase'

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type BabyRecord = {
  id: string
  prenom: string
  date_naissance: string
  sexe: string
  poids_naissance: number | null
  poids_actuel: number | null
  parcours: string
  type_lait?: string | null
  intolerances?: string[] | null
}

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#4A3F5C',
  marginBottom: 6,
  display: 'block' as const,
}

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px solid #F0E8F8',
  fontSize: 15,
  backgroundColor: '#FDF8F2',
  color: '#4A3F5C',
  outline: 'none',
  boxSizing: 'border-box' as const,
}

function multiSelectBtnStyle(selected: boolean) {
  return {
    padding: '10px 12px',
    borderRadius: 12,
    border: selected ? '2px solid #E8406A' : '1.5px solid #F0E8F8',
    backgroundColor: selected ? '#FFF0F5' : 'white',
    color: '#4A3F5C',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer' as const,
  }
}

function formatTypeLaitDisplay(typeLait: TypeLait | '') {
  if (!typeLait) return '—'
  return TYPE_LAIT_OPTIONS.find((o) => o.id === typeLait)?.label ?? typeLait
}

function formatIntolerancesDisplay(intolerances: Intolerance[]) {
  if (!intolerances.length) return 'Aucune'
  return intolerances
    .map((id) => INTOLERANCE_OPTIONS.find((o) => o.id === id)?.label ?? id)
    .join(' · ')
}

function selectBtnStyle(selected: boolean) {
  return {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 12,
    border: selected ? '1.5px solid #E8406A' : '1.5px solid #F0E8F8',
    backgroundColor: selected ? '#E8406A' : 'white',
    color: selected ? 'white' : '#4A3F5C',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer' as const,
  }
}

function WeeklyChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          height: 100,
        }}
      >
        {data.map((d) => (
          <div
            key={d.label}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <div
              style={{
                width: '100%',
                height: `${Math.max((d.count / max) * 80, d.count ? 12 : 4)}px`,
                backgroundColor: '#E8406A',
                borderRadius: 8,
                opacity: d.count ? 1 : 0.25,
              }}
            />
            <span style={{ fontSize: 11, color: '#8B7FA0', marginTop: 6 }}>{d.label}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#8B7FA0', textAlign: 'center', marginTop: 8 }}>
        Biberons par jour (7 derniers jours)
      </p>
    </div>
  )
}

function formatDateDisplay(date: string) {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  if (d && m && y) return `${d}/${m}/${y}`
  return date
}

function formatSexeDisplay(sexe: DemoBabySexe | '') {
  if (sexe === 'fille') return '👧 Fille'
  if (sexe === 'garcon') return '👦 Garçon'
  return '—'
}

function formatParcoursDisplay(parcours: DemoParcours | '') {
  const labels: Record<DemoParcours, string> = {
    allaite: '🤱 Allaitement',
    artificiel: '🍼 Biberon',
    mixte: '🤱🍼 Mixte',
  }
  return parcours ? labels[parcours] : '—'
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: '12px 16px',
        border: '1px solid #F0E8F5',
        backgroundColor: 'white',
        marginBottom: 12,
      }}
    >
      <p style={{ fontSize: 12, color: '#8B7FA0', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#4A3F5C', margin: 0 }}>
        {value || '—'}
      </p>
    </div>
  )
}

type ProfileSnapshot = {
  prenom: string
  sexe: DemoBabySexe | ''
  dateNaissance: string
  poidsNaissance: string
  poidsActuel: string
  parcours: DemoParcours | ''
  typeLait: TypeLait | ''
  intolerances: Intolerance[]
}

export default function ProfilPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [babyId, setBabyId] = useState<string | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)

  const [prenom, setPrenom] = useState('')
  const [sexe, setSexe] = useState<DemoBabySexe | ''>('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [poidsNaissance, setPoidsNaissance] = useState('')
  const [poidsActuel, setPoidsActuel] = useState('')
  const [parcours, setParcours] = useState<DemoParcours | ''>('')
  const [typeLait, setTypeLait] = useState<TypeLait | ''>('')
  const [intolerances, setIntolerances] = useState<Intolerance[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [demoSessionId, setDemoSessionId] = useState('')
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [draftSnapshot, setDraftSnapshot] = useState<ProfileSnapshot | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function showToast(message: string) {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 2000)
  }

  function enterEditMode() {
    setDraftSnapshot({
      prenom,
      sexe,
      dateNaissance,
      poidsNaissance,
      poidsActuel,
      parcours,
      typeLait,
      intolerances,
    })
    setFormError(null)
    setIsEditing(true)
  }

  function handleCancelEdit() {
    if (draftSnapshot) {
      setPrenom(draftSnapshot.prenom)
      setSexe(draftSnapshot.sexe)
      setDateNaissance(draftSnapshot.dateNaissance)
      setPoidsNaissance(draftSnapshot.poidsNaissance)
      setPoidsActuel(draftSnapshot.poidsActuel)
      setParcours(draftSnapshot.parcours)
      setTypeLait(draftSnapshot.typeLait)
      setIntolerances(draftSnapshot.intolerances)
    }
    setFormError(null)
    setIsEditing(false)
  }

  function handleResetDemoSession() {
    localStorage.clear()
    setResetMessage('Session réinitialisée ✅')
    setTimeout(() => router.push('/'), 1000)
  }

  useEffect(() => {
    const saved = loadBabyAvatar()
    if (saved) setAvatarUrl(saved)
  }, [])

  useEffect(() => {
    async function load() {
      const supabaseClient = createSupabaseClient()
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()

      if (!user) {
        setIsAuthenticated(false)
        const sessionId = getOrCreateSessionId()
        setDemoSessionId(sessionId)
        const saved = loadBabyAvatar()
        if (saved) setAvatarUrl(saved)
        const demoBaby = getDemoBaby(sessionId)
        if (demoBaby) {
          setPrenom(demoBaby.prenom)
          setSexe(demoBaby.sexe)
          setDateNaissance(demoBaby.date_naissance)
          setPoidsNaissance(String(demoBaby.poids_naissance))
          setPoidsActuel(String(demoBaby.poids_actuel))
          setParcours(demoBaby.parcours)
          setTypeLait((demoBaby.type_lait as TypeLait) ?? '')
          setIntolerances((demoBaby.intolerances as Intolerance[]) ?? [])
        } else {
          const pn = loadPoidsNaissance()
          const pa = loadPoidsActuel()
          if (pn) setPoidsNaissance(String(pn))
          if (pa) setPoidsActuel(String(pa))
        }
        setLoading(false)
        return
      }

      setIsAuthenticated(true)
      setUserId(user.id)
      const saved = loadBabyAvatar()
      if (saved) {
        setAvatarUrl(saved)
      } else {
        const authAvatar = await loadAuthAvatarUrl(user.id)
        if (authAvatar) setAvatarUrl(authAvatar)
      }

      const { data: baby } = await supabase
        .from('babies')
        .select('id, prenom, date_naissance, sexe, poids_naissance, poids_actuel, parcours, type_lait, intolerances')
        .limit(1)
        .single()

      if (baby) {
        const record = baby as BabyRecord
        setBabyId(record.id)
        setPrenom(record.prenom ?? '')
        setSexe((record.sexe as DemoBabySexe) ?? '')
        setDateNaissance(record.date_naissance ?? '')
        setPoidsNaissance(
          record.poids_naissance ? String(record.poids_naissance) : ''
        )
        setPoidsActuel(
          String(
            record.poids_actuel ??
              loadPoidsActuel() ??
              record.poids_naissance ??
              ''
          )
        )
        setParcours((record.parcours as DemoParcours) ?? '')
        setTypeLait((record.type_lait as TypeLait) ?? '')
        setIntolerances((record.intolerances as Intolerance[]) ?? [])

        const events = await fetchEventsFromDb(user.id)
        setStats(
          computeProfileStats(
            events,
            record.poids_actuel ?? loadPoidsActuel() ?? null,
            record.poids_naissance ?? null
          )
        )
      }

      setLoading(false)
    }

    load()
  }, [])

  function validate(): string | null {
    if (!prenom.trim()) return 'Le prénom est obligatoire.'
    if (!sexe) return 'Le sexe est obligatoire.'
    if (!dateNaissance) return 'La date de naissance est obligatoire.'
    const poidsNaissanceNum = parseFloat(poidsNaissance.replace(',', '.'))
    const poidsActuelNum = parseFloat(poidsActuel.replace(',', '.'))
    if (!poidsNaissance || !poidsNaissanceNum || poidsNaissanceNum <= 0) {
      return 'Le poids de naissance est obligatoire.'
    }
    if (!poidsActuel || !poidsActuelNum || poidsActuelNum <= 0) {
      return 'Le poids actuel est obligatoire.'
    }
    if (!parcours) return 'Le parcours est obligatoire.'
    return null
  }

  function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      if (!base64?.startsWith('data:image/')) {
        setFormError('Format d\'image non supporté.')
        return
      }
      saveBabyAvatar(base64)
      setAvatarUrl(base64)
      setFormError(null)

      if (isAuthenticated && userId) {
        uploadAuthAvatar(userId, file).catch((err) => {
          console.error('[Avatar]', err)
        })
      }
    }
    reader.onerror = () => {
      setFormError('Impossible de lire la photo.')
    }
    reader.readAsDataURL(file)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSave() {
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)
    setFormError(null)
    const poidsNaissanceNum = parseFloat(poidsNaissance.replace(',', '.'))
    const poidsActuelNum = parseFloat(poidsActuel.replace(',', '.'))

    try {
      saveWeightLocalStorage(poidsNaissanceNum, poidsActuelNum)

      if (!isAuthenticated) {
        const sessionId = getOrCreateSessionId()
        const baby: DemoBaby = {
          session_id: sessionId,
          prenom: prenom.trim(),
          sexe: sexe as DemoBabySexe,
          date_naissance: dateNaissance,
          poids_naissance: poidsNaissanceNum,
          poids_actuel: poidsActuelNum,
          parcours: parcours as DemoParcours,
          type_lait: typeLait || null,
          intolerances: intolerances.length ? intolerances : null,
        }
        saveDemoBaby(baby)
        setIsEditing(false)
        showToast('✅ Profil mis à jour')
        return
      }

      if (!babyId) throw new Error('Bébé introuvable')

      const { error } = await supabase
        .from('babies')
        .update({
          prenom: prenom.trim(),
          sexe,
          date_naissance: dateNaissance,
          poids_naissance: poidsNaissanceNum,
          poids_actuel: poidsActuelNum,
          parcours,
          type_lait: typeLait || null,
          intolerances: intolerances.length ? intolerances : [],
        })
        .eq('id', babyId)

      if (error) throw error

      const events = await fetchEventsFromDb(userId!)
      setStats(
        computeProfileStats(events, poidsActuelNum, poidsNaissanceNum)
      )
      setIsEditing(false)
      showToast('✅ Profil mis à jour')
    } catch (err) {
      console.error('[Profil]', err)
      setFormError('Impossible d\'enregistrer les modifications.')
    } finally {
      setSaving(false)
    }
  }

  const backButton = (
    <button
      type="button"
      onClick={() => router.back()}
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        zIndex: 50,
        backgroundColor: 'white',
        border: '1.5px solid #F0E8F5',
        borderRadius: 20,
        padding: '8px 16px',
        fontSize: 14,
        color: '#8B7FA0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      ← Retour
    </button>
  )

  if (loading) {
    return (
      <>
        {backButton}
        <main
          style={{
            backgroundColor: '#FDF8F2',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ fontSize: 14, color: '#8B7FA0' }}>Chargement...</p>
        </main>
      </>
    )
  }

  return (
    <>
      {backButton}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#4CAF50',
            color: 'white',
            borderRadius: 20,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            zIndex: 200,
            boxShadow: '0 4px 16px rgba(76,175,80,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          {toastMessage}
        </div>
      )}
      <main
        style={{
          backgroundColor: '#FDF8F2',
          minHeight: '100vh',
          padding: '32px 16px 40px',
          boxSizing: 'border-box',
        }}
      >
      <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <img
            src="/logo-horizontal.png"
            alt="Mon Bebebou"
            style={{ width: '100%', maxWidth: 200, height: 'auto' }}
          />
        </header>

        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 24,
            padding: 32,
            boxShadow: '0 8px 32px rgba(74,63,92,0.10)',
            marginBottom: 16,
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#4A3F5C',
              textAlign: 'center',
              margin: '0 0 16px',
            }}
          >
            Profil bébé 👶
          </h1>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            {isEditing ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{ borderRadius: '50%' }}
                >
                  <BabyAvatar
                    prenom={prenom || '?'}
                    photoUrl={avatarUrl}
                    size={80}
                    showCameraIcon
                    onClick={() => fileInputRef.current?.click()}
                  />
                </motion.div>
              </>
            ) : (
              <BabyAvatar
                prenom={prenom || '?'}
                photoUrl={avatarUrl}
                size={80}
              />
            )}
          </div>

          {formError && (
            <p
              style={{
                fontSize: 13,
                color: '#C03060',
                textAlign: 'center',
                marginBottom: 16,
              }}
            >
              {formError}
            </p>
          )}

          {!isEditing ? (
            <>
              <ReadField label="Prénom" value={prenom} />
              <ReadField label="Sexe" value={formatSexeDisplay(sexe)} />
              <ReadField
                label="Date de naissance"
                value={formatDateDisplay(dateNaissance)}
              />
              <ReadField
                label="Poids de naissance (kg)"
                value={poidsNaissance ? `${poidsNaissance.replace('.', ',')} kg` : '—'}
              />
              <ReadField
                label="Poids actuel (kg)"
                value={poidsActuel ? `${poidsActuel.replace('.', ',')} kg` : '—'}
              />
              <ReadField label="Parcours" value={formatParcoursDisplay(parcours)} />
              <ReadField label="Type de lait" value={formatTypeLaitDisplay(typeLait)} />
              <ReadField
                label="Intolérances connues"
                value={formatIntolerancesDisplay(intolerances)}
              />

              <button
                type="button"
                onClick={enterEditMode}
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: '#E8406A',
                  color: 'white',
                  fontSize: 15,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(232,64,106,0.35)',
                }}
              >
                ✏️ Modifier le profil
              </button>
            </>
          ) : (
            <>
              <label style={labelStyle}>Prénom</label>
              <input
                type="text"
                value={prenom}
                onChange={(e) => {
                  setPrenom(e.target.value)
                  setFormError(null)
                }}
                placeholder="Prénom de votre bébé"
                style={{ ...inputStyle, marginBottom: 16 }}
              />

              <label style={labelStyle}>Sexe</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => {
                    setSexe('fille')
                    setFormError(null)
                  }}
                  style={selectBtnStyle(sexe === 'fille')}
                >
                  👧 Fille
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSexe('garcon')
                    setFormError(null)
                  }}
                  style={selectBtnStyle(sexe === 'garcon')}
                >
                  👦 Garçon
                </button>
              </div>

              <label style={labelStyle}>Date de naissance</label>
              <input
                type="date"
                value={dateNaissance}
                onChange={(e) => {
                  setDateNaissance(e.target.value)
                  setFormError(null)
                }}
                style={{ ...inputStyle, marginBottom: 16 }}
              />

              <label style={labelStyle}>Poids de naissance (kg)</label>
              <input
                type="number"
                value={poidsNaissance}
                onChange={(e) => {
                  setPoidsNaissance(e.target.value)
                  setFormError(null)
                }}
                placeholder="3.2"
                step="0.1"
                min="0.5"
                max="8"
                style={{ ...inputStyle, marginBottom: 16 }}
              />

              <label style={labelStyle}>Poids actuel (kg)</label>
              <input
                type="number"
                value={poidsActuel}
                onChange={(e) => {
                  setPoidsActuel(e.target.value)
                  setFormError(null)
                }}
                placeholder="4.5"
                step="0.1"
                min="0.5"
                max="15"
                style={{ ...inputStyle, marginBottom: 6 }}
              />
              <p
                style={{
                  fontSize: 12,
                  color: '#8B7FA0',
                  marginTop: 0,
                  marginBottom: 16,
                }}
              >
                Utilisé pour calculer les doses
              </p>

              <label style={labelStyle}>Parcours</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {(
                  [
                    ['allaite', '🤱 Allaitement'],
                    ['artificiel', '🍼 Biberon'],
                    ['mixte', '🤱🍼 Mixte'],
                  ] as [DemoParcours, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setParcours(value)
                      setFormError(null)
                    }}
                    style={{
                      ...selectBtnStyle(parcours === value),
                      flex: '1 1 45%',
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#8B7FA0',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  margin: '8px 0 12px',
                }}
              >
                🍼 Alimentation &amp; Santé
              </p>

              <label style={labelStyle}>Type de lait</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {TYPE_LAIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTypeLait(opt.id)
                      setFormError(null)
                    }}
                    style={{
                      ...selectBtnStyle(typeLait === opt.id),
                      flex: '1 1 45%',
                      fontSize: 13,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>Intolérances connues</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {INTOLERANCE_OPTIONS.map((opt) => {
                  const selected = intolerances.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setIntolerances((prev) =>
                          selected
                            ? prev.filter((id) => id !== opt.id)
                            : [...prev, opt.id]
                        )
                        setFormError(null)
                      }}
                      style={multiSelectBtnStyle(selected)}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 16,
                    backgroundColor: 'white',
                    border: '1.5px solid #F0E8F5',
                    color: '#8B7FA0',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 2,
                    padding: 14,
                    borderRadius: 16,
                    backgroundColor: '#E8406A',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 700,
                    border: 'none',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                    boxShadow: '0 4px 16px rgba(232,64,106,0.35)',
                  }}
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer ✓'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        {!isAuthenticated ? (
          <div
            style={{
              position: 'relative',
              backgroundColor: '#E8E0F0',
              borderRadius: 24,
              padding: 24,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                filter: 'blur(6px)',
                opacity: 0.45,
                pointerEvents: 'none',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {[72, 48, 96, 56, 80].map((height, index) => (
                <div
                  key={index}
                  className="animate-pulse"
                  style={{
                    height,
                    borderRadius: 10,
                    backgroundColor: '#C4B5D4',
                    width: index % 2 === 0 ? '100%' : '75%',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                backgroundColor: 'rgba(255,255,255,0.55)',
              }}
            >
              <span style={{ fontSize: 32, marginBottom: 8 }}>🔒</span>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#4A3F5C',
                  margin: '0 0 16px',
                  textAlign: 'center',
                }}
              >
                Vos statistiques vous attendent
              </p>
              <button
                type="button"
                onClick={() => router.push('/register')}
                style={{
                  padding: '14px 20px',
                  borderRadius: 14,
                  backgroundColor: '#E8406A',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  boxShadow: '0 4px 16px rgba(232,64,106,0.35)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                Créer mon compte pour accéder aux stats
              </button>
            </div>
          </div>
        ) : stats ? (
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 24,
              padding: 24,
              boxShadow: '0 8px 32px rgba(74,63,92,0.10)',
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#4A3F5C',
                margin: '0 0 16px',
              }}
            >
              Vos statistiques
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  backgroundColor: '#FDF8F2',
                  borderRadius: 16,
                  padding: 14,
                  textAlign: 'center',
                }}
              >
                <p style={{ fontSize: 24, fontWeight: 800, color: '#E8406A', margin: 0 }}>
                  {stats.biberonsToday}
                </p>
                <p style={{ fontSize: 12, color: '#8B7FA0', margin: '4px 0 0' }}>
                  Biberons aujourd&apos;hui
                </p>
              </div>
              <div
                style={{
                  backgroundColor: '#FDF8F2',
                  borderRadius: 16,
                  padding: 14,
                  textAlign: 'center',
                }}
              >
                <p style={{ fontSize: 24, fontWeight: 800, color: '#4A3F5C', margin: 0 }}>
                  {stats.biberonsYesterday}
                </p>
                <p style={{ fontSize: 12, color: '#8B7FA0', margin: '4px 0 0' }}>
                  Biberons hier
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#FDF8F2',
                borderRadius: 16,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <p style={{ fontSize: 13, color: '#8B7FA0', margin: '0 0 4px' }}>
                Intervalle moyen entre les repas
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#4A3F5C', margin: 0 }}>
                {stats.avgIntervalLabel}
              </p>
            </div>

            <div
              style={{
                backgroundColor: '#FDF8F2',
                borderRadius: 16,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 13, color: '#8B7FA0', margin: '0 0 4px' }}>
                {stats.weightLabel}
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#4A3F5C', margin: 0 }}>
                {stats.displayWeight != null ? `${stats.displayWeight} kg` : '—'}
              </p>
            </div>

            <WeeklyChart data={stats.weeklyBiberons} />
          </div>
        ) : null}

        {!isAuthenticated && (
          <div style={{ marginTop: 24 }}>
            {resetMessage && (
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#4A3F5C',
                  textAlign: 'center',
                  margin: '0 0 12px',
                }}
              >
                {resetMessage}
              </p>
            )}
            <button
              type="button"
              onClick={handleResetDemoSession}
              disabled={Boolean(resetMessage)}
              style={{
                backgroundColor: 'transparent',
                border: '1.5px solid #F0E8F5',
                color: '#8B7FA0',
                borderRadius: 12,
                padding: '12px 16px',
                width: '100%',
                fontSize: 13,
                cursor: resetMessage ? 'default' : 'pointer',
                opacity: resetMessage ? 0.6 : 1,
              }}
            >
              🔄 Réinitialiser ma session démo
            </button>
          </div>
        )}
      </div>
    </main>
    </>
  )
}
