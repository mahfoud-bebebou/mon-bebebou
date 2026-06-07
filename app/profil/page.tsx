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
import { RoleGrid } from '@/components/RoleGrid'
import { getRoleLabel } from '@/lib/roles'
import {
  type FamilyMemberProfile,
  extractOnlineUserIds,
  formatLastSeen,
  generateInviteCodeFromFamilyId,
  getMemberPrenom,
} from '@/lib/family'

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

function parseIntolerances(value: unknown): Intolerance[] {
  if (!value) return []
  if (Array.isArray(value)) return value as Intolerance[]
  return []
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
  monRole: string
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

  const [familyId, setFamilyId] = useState<string | null>(null)
  const [monRole, setMonRole] = useState('')
  const [monPrenomUser, setMonPrenomUser] = useState('')
  const [membres, setMembres] = useState<FamilyMemberProfile[]>([])
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [showInviteBlock, setShowInviteBlock] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [inviteCopied, setInviteCopied] = useState(false)

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
      monRole,
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
      setMonRole(draftSnapshot.monRole)
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
    async function loadProfile(user: { id: string; email?: string | null }) {
      const supabaseClient = createSupabaseClient()

      setIsAuthenticated(true)
      setUserId(user.id)
      const saved = loadBabyAvatar()
      if (saved) {
        setAvatarUrl(saved)
      } else {
        const authAvatar = await loadAuthAvatarUrl(user.id)
        if (authAvatar) setAvatarUrl(authAvatar)
      }

      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profile?.family_id) {
        setFormError('Profil famille introuvable')
        setLoading(false)
        return
      }

      setFamilyId(profile.family_id)
      setMonRole(profile.role ?? '')
      setMonPrenomUser(
        profile.prenom?.trim() ||
          (profile.role === 'papa'
            ? profile.prenom_papa
            : profile.prenom_maman) ||
          profile.prenom_maman ||
          profile.prenom_papa ||
          ''
      )

      await supabaseClient
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id)

      const expectedInviteCode = generateInviteCodeFromFamilyId(profile.family_id)

      const { data: familyRow } = await supabaseClient
        .from('families')
        .select('invite_code')
        .eq('id', profile.family_id)
        .maybeSingle()

      if (familyRow?.invite_code === expectedInviteCode) {
        setInviteCode(familyRow.invite_code)
      } else {
        const { data: updated } = await supabaseClient
          .from('families')
          .update({ invite_code: expectedInviteCode })
          .eq('id', profile.family_id)
          .select('invite_code')
          .maybeSingle()
        setInviteCode(updated?.invite_code ?? expectedInviteCode)
      }

      const { data: membresData } = await supabaseClient
        .from('profiles')
        .select('id, prenom, prenom_maman, prenom_papa, role, last_seen')
        .eq('family_id', profile.family_id)

      if (membresData) setMembres(membresData as FamilyMemberProfile[])

      const { data: babyData, error: babyError } = await supabaseClient
        .from('babies')
        .select('*')
        .eq('family_id', profile.family_id)
        .maybeSingle()

      if (babyError) {
        console.error('Baby error:', babyError)
        setFormError(`Erreur: ${babyError.message}`)
        setLoading(false)
        return
      }

      if (!babyData) {
        setFormError(`Bébé introuvable pour family_id: ${profile.family_id}`)
        setLoading(false)
        return
      }

      const record = babyData as BabyRecord
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
      setIntolerances(parseIntolerances(record.intolerances))

      const events = await fetchEventsFromDb(user.id)
      setStats(
        computeProfileStats(
          events,
          record.poids_actuel ?? loadPoidsActuel() ?? null,
          record.poids_naissance ?? null
        )
      )

      setLoading(false)
    }

    async function checkAuth() {
      const supabaseClient = createSupabaseClient()
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      await loadProfile(user)
    }

    checkAuth()
  }, [router])

  useEffect(() => {
    if (!isAuthenticated || !familyId || !userId) return

    const supabaseClient = createSupabaseClient()
    type PresencePayload = { user_id: string; online_at: string }

    const presenceChannel = supabaseClient
      .channel(`family-presence-${familyId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<PresencePayload>()
        setOnlineUserIds(extractOnlineUserIds(state))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      void supabaseClient.removeChannel(presenceChannel)
      setOnlineUserIds(new Set())
    }
  }, [isAuthenticated, familyId, userId])

  async function handleCopyInviteCode() {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {
      showToast('Impossible de copier le code')
    }
  }

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
          intolerances,
        }
        saveDemoBaby(baby)
        setIsEditing(false)
        showToast('✅ Profil mis à jour')
        return
      }

      if (!babyId) {
        setFormError('Bébé introuvable')
        return
      }

      const supabaseClient = createSupabaseClient()
      const { error } = await supabaseClient
        .from('babies')
        .update({
          prenom: prenom.trim(),
          sexe,
          date_naissance: dateNaissance,
          poids_naissance: poidsNaissanceNum,
          poids_actuel: poidsActuelNum,
          parcours,
          type_lait: typeLait || null,
          intolerances,
        })
        .eq('id', babyId)

      if (error) {
        console.error('Supabase error:', error)
        setFormError(`Erreur: ${error.message} (${error.code})`)
        return
      }

      if (monRole) {
        const profileUpdate: Record<string, unknown> = {
          role: monRole,
          last_seen: new Date().toISOString(),
        }
        if (monRole === 'maman') profileUpdate.prenom_maman = monPrenomUser.trim()
        if (monRole === 'papa') profileUpdate.prenom_papa = monPrenomUser.trim()

        const { error: roleError } = await supabaseClient
          .from('profiles')
          .update(profileUpdate)
          .eq('id', userId!)

        if (roleError) {
          console.error('Supabase error:', roleError)
          setFormError(`Erreur: ${roleError.message} (${roleError.code})`)
          return
        }
      }

      const events = await fetchEventsFromDb(userId!)
      setStats(
        computeProfileStats(events, poidsActuelNum, poidsNaissanceNum)
      )
      setIsEditing(false)
      showToast('✅ Profil mis à jour')
    } catch (err) {
      console.error('[Profil]', err)
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Erreur inattendue'
      setFormError(`Erreur: ${message}`)
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

              {isAuthenticated && (
                <div style={{ marginBottom: 24 }}>
                  <RoleGrid
                    title="Mon rôle dans la famille"
                    selectedRole={monRole}
                    onSelect={(roleId) => {
                      setMonRole(roleId)
                      setFormError(null)
                    }}
                    disabled={saving}
                  />
                </div>
              )}

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

        {isAuthenticated && familyId && !isEditing && (
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 24,
              padding: 24,
              boxShadow: '0 8px 32px rgba(74,63,92,0.10)',
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#4A3F5C',
                margin: '0 0 20px',
              }}
            >
              👨‍👩‍👧 Notre famille
            </h2>

            {(() => {
              const roleInfo = getRoleLabel(monRole)
              return (
                <div
                  style={{
                    backgroundColor: `${roleInfo.color}33`,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      backgroundColor: roleInfo.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 32,
                      flexShrink: 0,
                    }}
                  >
                    {roleInfo.emoji}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#4A3F5C',
                        margin: '0 0 6px',
                      }}
                    >
                      {monPrenomUser || 'Moi'}
                    </p>
                    <span
                      style={{
                        display: 'inline-block',
                        backgroundColor: roleInfo.color,
                        borderRadius: 20,
                        padding: '4px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#4A3F5C',
                      }}
                    >
                      {roleInfo.emoji} {roleInfo.label}
                    </span>
                  </div>
                </div>
              )
            })()}

            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#8B7FA0',
                textTransform: 'uppercase',
                letterSpacing: 1,
                margin: '0 0 12px',
              }}
            >
              Membres de la famille
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {membres
                .filter((m) => m.id !== userId)
                .map((membre) => {
                  const roleInfo = getRoleLabel(membre.role)
                  const prenom = getMemberPrenom(membre)
                  const isOnline = onlineUserIds.has(membre.id)
                  return (
                    <div
                      key={membre.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 14,
                        border: '1px solid #F0E8F5',
                        backgroundColor: '#FDF8F2',
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          backgroundColor: roleInfo.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 22,
                          flexShrink: 0,
                        }}
                      >
                        {roleInfo.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: '#4A3F5C',
                            margin: '0 0 4px',
                          }}
                        >
                          {prenom}
                        </p>
                        <span
                          style={{
                            display: 'inline-block',
                            backgroundColor: roleInfo.color,
                            borderRadius: 20,
                            padding: '2px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#4A3F5C',
                            marginBottom: 4,
                          }}
                        >
                          {roleInfo.emoji} {roleInfo.label}
                        </span>
                        <p
                          style={{
                            fontSize: 12,
                            color: isOnline ? '#4CAF50' : '#8B7FA0',
                            margin: 0,
                          }}
                        >
                          {isOnline ? '🟢 En ligne' : '⚫ ' + formatLastSeen(membre.last_seen, false)}
                        </p>
                      </div>
                    </div>
                  )
                })}

              {membres.filter((m) => m.id !== userId).length === 0 && (
                <p style={{ fontSize: 13, color: '#8B7FA0', margin: 0 }}>
                  Tu es le seul membre pour l&apos;instant.
                </p>
              )}
            </div>

            {membres.length < 5 && (
              <button
                type="button"
                onClick={() => setShowInviteBlock((v) => !v)}
                style={{
                  width: '100%',
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: 'white',
                  border: '1.5px solid #E8406A',
                  color: '#E8406A',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ➕ Inviter quelqu&apos;un
              </button>
            )}

            {showInviteBlock && inviteCode && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 14,
                  backgroundColor: '#FDF8F2',
                  border: '1px solid #F0E8F5',
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: '#8B7FA0',
                    margin: '0 0 8px',
                  }}
                >
                  Partage ce code avec ta famille :
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 24,
                      fontWeight: 800,
                      letterSpacing: 4,
                      color: '#4A3F5C',
                      textAlign: 'center',
                    }}
                  >
                    {inviteCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyInviteCode}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      backgroundColor: '#E8406A',
                      color: 'white',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inviteCopied ? 'Copié ✓' : 'Copier'}
                  </button>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: '#8B7FA0',
                    margin: '10px 0 0',
                    textAlign: 'center',
                  }}
                >
                  Ils pourront rejoindre sur{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/rejoindre')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#E8406A',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    /rejoindre
                  </button>
                </p>
              </div>
            )}
          </div>
        )}

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
