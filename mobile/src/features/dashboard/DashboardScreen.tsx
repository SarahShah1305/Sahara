import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import hospitalDataset from '../../data/hospitals.json';

export type HospitalRecord = (typeof hospitalDataset.records)[number];
export type CapacityRecord = { total: number; occupied: number; unavailable: number; available: number };
export type CapacityMap = Record<string, Record<string, CapacityRecord>>;
export type AppointmentRecord = {
  id: string; user_id: string; hospital_id: string; care_type: string; specialty: string; doctor_name: string;
  appointment_at: string; amount_pkr: number | null; status: string; created_at: string;
};
export type ResourceRequest = {
  id: string; user_id: string; requester_name: string; requester_phone: string | null;
  requester_email: string | null; requester_role: string; request_kind: 'bed' | 'referral';
  hospital_id: string; hospital_name: string; resource_type: string; reason: string;
  amount_pkr: number | null; status: string; created_at: string; updated_at: string; duplicate_hidden?: boolean;
};
export type HospitalReview = { verification_status: string; account_status: string; admin_note: string; reviewed_at: string | null };

const resourceRows = [
  ['general_bed', 'General beds', 'generalBeds'],
  ['private_room', 'Private rooms', 'privateRooms'],
  ['emergency_bed', 'Emergency beds', 'emergencyBeds'],
  ['icu_bed', 'ICU beds', 'icuBeds'],
  ['nicu_bed', 'NICU beds', 'nicuBeds'],
  ['ventilator', 'Ventilators', 'ventilators'],
  ['operation_theatre', 'Operation theatres', 'operationTheatres'],
  ['isolation_bed', 'Isolation beds', 'isolationBeds'],
  ['trauma_bed', 'Trauma beds', 'traumaBeds'],
  ['dialysis_machine', 'Dialysis machines', 'dialysisMachines'],
] as const;

const emergencyResources = [
  ['emergency_bed', 'Emergency bed'], ['icu_bed', 'ICU bed'], ['ventilator', 'Ventilator'],
  ['trauma_bed', 'Trauma bed'], ['dialysis_machine', 'Dialysis'],
] as const;

const displayTime = (value: string) => new Date(value).toLocaleString('en-PK', {
  timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short',
});
const resourceLabel = (value: string) => resourceRows.find(([key]) => key === value)?.[1] ?? value.replaceAll('_', ' ');
const roleLabel = (value: string) => value === 'ambulance_coordinator' ? 'Ambulance coordinator' : value.replaceAll('_', ' ');

type Props = {
  role: 'Hospital staff' | 'Administrator' | 'Ambulance / emergency worker';
  capacity: CapacityMap;
  appointments: AppointmentRecord[];
  requests: ResourceRequest[];
  requestSyncMessage: string;
  requestRefreshing: boolean;
  onRefreshRequests: () => void;
  hospitalReviews: Record<string, HospitalReview>;
  onReviewHospital: (hospitalId: string, verificationStatus: string, accountStatus: string) => void;
  staffHospitalId: string;
  setStaffHospitalId: (hospitalId: string) => void;
  onAdjust: (hospitalId: string, resourceType: string, direction: number) => void;
  onReviewRequest: (id: string, accept: boolean) => void;
  onConfirmTransfer: (id: string) => void;
  onCreateReferral: (hospitalId: string, resourceType: string, reason: string) => void;
};

export default function DashboardScreen(props: Props) {
  const { role, capacity, appointments, requests, staffHospitalId, setStaffHospitalId,
    onAdjust, onReviewRequest, onConfirmTransfer, onCreateReferral, requestSyncMessage,
    requestRefreshing, onRefreshRequests, hospitalReviews, onReviewHospital } = props;
  const [hospitalQuery, setHospitalQuery] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [adminTab, setAdminTab] = useState<'hospitals' | 'requests'>('hospitals');
  const [adminFilter, setAdminFilter] = useState<'all' | 'needs_review' | 'inactive'>('all');
  const [expandedHospital, setExpandedHospital] = useState<string | null>(null);

  const visibleHospitals = useMemo(() => hospitalDataset.records.filter(hospital => {
    const query = hospitalQuery.trim().toLowerCase();
    const review = hospitalReviews[hospital.id] ?? { verification_status: 'pending', account_status: 'active' };
    const matchesQuery = !query || hospital.name.toLowerCase().includes(query) || hospital.area.toLowerCase().includes(query);
    const matchesFilter = adminFilter === 'all'
      || (adminFilter === 'needs_review' && review.verification_status !== 'verified')
      || (adminFilter === 'inactive' && review.account_status === 'inactive');
    return matchesQuery && (role !== 'Administrator' || matchesFilter);
  }), [hospitalQuery, hospitalReviews, adminFilter, role]);

  const selectedHospital = hospitalDataset.records.find(hospital => hospital.id === staffHospitalId) ?? hospitalDataset.records[0];
  const pendingRequests = requests.filter(request => request.status === 'pending');
  const pendingTotal = requests.filter(request => request.status === 'pending').length;
  const availableEmergency = hospitalDataset.records.reduce((sum, hospital) => sum + (capacity[hospital.id]?.emergency_bed?.available ?? hospital.resources.emergencyBeds.available), 0);
  const emergencyHospitals = hospitalDataset.records.filter(hospital => (capacity[hospital.id]?.emergency_bed?.available ?? hospital.resources.emergencyBeds.available) > 0);

  function count(hospital: HospitalRecord, resource: string, localKey: string) {
    return capacity[hospital.id]?.[resource]?.available ?? (hospital.resources as any)[localKey]?.available ?? 0;
  }

  return <>
    <Text style={s.eyebrow}>SAHARA WORKSPACE</Text>
    <Text style={s.title}>{role}</Text>
    <Text style={s.subtitle}>{role === 'Hospital staff'
      ? 'Manage your facility capacity and respond to incoming bed requests.'
      : role === 'Administrator'
        ? 'Monitor facilities, capacity, resource requests and system activity.'
        : 'Compare emergency resources, send referrals and track transfer responses.'}</Text>

    {role === 'Hospital staff' && <>
      <View style={s.sectionHead}><Text style={s.sectionTitle}>Select hospital</Text><Text style={s.sectionMeta}>Tap to manage</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hospitalPicker}>
        {hospitalDataset.records.map(hospital => <TouchableOpacity key={hospital.id}
          onPress={() => setStaffHospitalId(hospital.id)}
          style={[s.hospitalChip, hospital.id === staffHospitalId && s.hospitalChipSelected]}>
          <Text style={[s.hospitalChipText, hospital.id === staffHospitalId && s.hospitalChipTextSelected]}>{hospital.name}</Text>
          <Text style={s.hospitalChipArea}>{hospital.area}</Text>
        </TouchableOpacity>)}
      </ScrollView>

      <View style={s.card}>
        <Text style={s.cardTitle}>{selectedHospital.name}</Text>
        <Text style={s.muted}>{selectedHospital.area} · Capacity last synced from Sahara</Text>
        <View style={s.summaryGrid}>
          {resourceRows.map(([type, label, localKey]) => {
            const item = capacity[selectedHospital.id]?.[type];
            const available = count(selectedHospital, type, localKey);
            const total = item?.total ?? (selectedHospital.resources as any)[localKey]?.total ?? available;
            const occupied = item?.occupied ?? (selectedHospital.resources as any)[localKey]?.occupied ?? 0;
            const unavailable = item?.unavailable ?? (selectedHospital.resources as any)[localKey]?.unavailable ?? 0;
            return <View key={type} style={s.resourceCard}>
              <Text style={s.resourceTitle}>{label}</Text>
              <Text style={s.resourceAvailable}>{available} <Text style={s.resourceAvailableLabel}>available</Text></Text>
              <Text style={s.resourceMeta}>Total {total} · Occupied {occupied} · Unavailable {unavailable}</Text>
              <View style={s.buttonRow}>
                <TouchableOpacity onPress={() => onAdjust(selectedHospital.id, type, -1)} style={s.smallButton}><Text style={s.smallButtonText}>− Occupy</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => onAdjust(selectedHospital.id, type, 1)} style={s.smallButton}><Text style={s.smallButtonText}>+ Free</Text></TouchableOpacity>
              </View>
            </View>;
          })}
        </View>
      </View>

      <View style={s.sectionHead}><Text style={s.sectionTitle}>Incoming requests · all hospitals</Text><View style={s.requestHeaderActions}><Text style={s.countBadge}>{pendingRequests.length} pending</Text><TouchableOpacity onPress={onRefreshRequests} disabled={requestRefreshing} style={s.refreshButton}><Text style={s.refreshButtonText}>{requestRefreshing ? 'Refreshing…' : 'Refresh'}</Text></TouchableOpacity></View></View>
      {!!requestSyncMessage && <View style={s.syncNotice}><Text style={s.syncNoticeText}>{requestSyncMessage}</Text></View>}
      {pendingRequests.length === 0 && <View style={s.empty}><Text style={s.emptyTitle}>No requests waiting</Text><Text style={s.muted}>New bed and referral requests for this hospital appear here.</Text></View>}
      {pendingRequests.map(request => <RequestCard key={request.id} request={request}
        onAccept={() => onReviewRequest(request.id, true)} onReject={() => onReviewRequest(request.id, false)} />)}
      <View style={s.sectionHead}><Text style={s.sectionTitle}>Recent appointments</Text><Text style={s.sectionMeta}>{appointments.filter(a => a.hospital_id === staffHospitalId).length}</Text></View>
      {appointments.filter(a => a.hospital_id === staffHospitalId).slice(0, 8).map(appointment => <AppointmentCard key={appointment.id} appointment={appointment} />)}
    </>}

    {role === 'Administrator' && <>
      <View style={s.statsRow}>
        <TouchableOpacity onPress={() => setAdminTab('hospitals')} style={s.statCard}><Text style={s.statNumber}>{hospitalDataset.records.length}</Text><Text style={s.statLabel}>Hospitals</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setAdminTab('requests')} style={s.statCard}><Text style={s.statNumber}>{pendingTotal}</Text><Text style={s.statLabel}>Pending requests</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setAdminTab('hospitals')} style={s.statCard}><Text style={s.statNumber}>{appointments.length}</Text><Text style={s.statLabel}>Appointments</Text></TouchableOpacity>
      </View>
      <View style={s.tabs}>
        <TouchableOpacity onPress={() => setAdminTab('hospitals')} style={[s.tab, adminTab === 'hospitals' && s.tabSelected]}><Text style={[s.tabText, adminTab === 'hospitals' && s.tabTextSelected]}>Facilities & capacity</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setAdminTab('requests')} style={[s.tab, adminTab === 'requests' && s.tabSelected]}><Text style={[s.tabText, adminTab === 'requests' && s.tabTextSelected]}>Request activity</Text></TouchableOpacity>
      </View>
      {adminTab === 'hospitals' ? <>
        <View style={s.filterChips}>{([['all','All'],['needs_review','Needs review'],['inactive','Inactive']] as const).map(([value,label])=><TouchableOpacity key={value} onPress={()=>setAdminFilter(value)} style={[s.filterChip,adminFilter===value&&s.filterChipActive]}><Text style={[s.filterChipText,adminFilter===value&&s.filterChipTextActive]}>{label}</Text></TouchableOpacity>)}</View>
        <TextInput value={hospitalQuery} onChangeText={setHospitalQuery} style={s.searchInput} placeholder="Search hospitals or areas" />
        {visibleHospitals.map(hospital => {
          const review = hospitalReviews[hospital.id] ?? { verification_status: 'pending', account_status: 'active', admin_note: '', reviewed_at: null };
          const verificationLabel = review.verification_status.replace('_', ' ');
          return <View key={hospital.id} style={s.card}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => setExpandedHospital(expandedHospital === hospital.id ? null : hospital.id)}>
          <View style={s.rowBetween}><View style={{ flex: 1, minWidth: 0 }}><Text style={s.cardTitle} numberOfLines={2}>{hospital.name}</Text><Text style={s.muted}>{hospital.area} · {hospital.phone}</Text></View><Text style={s.expand}>{expandedHospital === hospital.id ? '−' : '+'}</Text></View>
          <View style={s.reviewBadges}><Text style={[s.reviewBadge, review.verification_status==='verified'?s.reviewVerified:s.reviewNeedsReview]}>{verificationLabel}</Text><Text style={[s.reviewBadge, review.account_status==='inactive'?s.reviewInactive:s.reviewActive]}>{review.account_status}</Text></View>
          <Text style={s.hospitalSummary}>General {count(hospital, 'general_bed', 'generalBeds')} · ICU {count(hospital, 'icu_bed', 'icuBeds')} · Rooms {count(hospital, 'private_room', 'privateRooms')} · Emergency {count(hospital, 'emergency_bed', 'emergencyBeds')}</Text>
          </TouchableOpacity>
          {expandedHospital === hospital.id && <>
            <View style={s.divider} />
            <Text style={s.detailLine}>Hospital account review</Text>
            <View style={s.buttonRow}>
              <TouchableOpacity onPress={()=>onReviewHospital(hospital.id,'verified',review.account_status)} style={s.primarySmallButton}><Text style={s.primarySmallButtonText}>Mark verified</Text></TouchableOpacity>
              <TouchableOpacity onPress={()=>onReviewHospital(hospital.id,'inaccurate',review.account_status)} style={s.rejectButton}><Text style={s.rejectButtonText}>Flag inaccurate</Text></TouchableOpacity>
              <TouchableOpacity onPress={()=>onReviewHospital(hospital.id,'pending',review.account_status)} style={s.smallButton}><Text style={s.smallButtonText}>Needs review</Text></TouchableOpacity>
            </View>
            <View style={s.buttonRow}>
              <TouchableOpacity onPress={()=>onReviewHospital(hospital.id,review.verification_status,'active')} style={s.smallButton}><Text style={s.smallButtonText}>Set active</Text></TouchableOpacity>
              <TouchableOpacity onPress={()=>onReviewHospital(hospital.id,review.verification_status,'inactive')} style={s.rejectButton}><Text style={s.rejectButtonText}>Set inactive</Text></TouchableOpacity>
            </View>
            {review.reviewed_at&&<Text style={s.muted}>Last reviewed {displayTime(review.reviewed_at)}</Text>}
            {resourceRows.map(([type, label, localKey]) => {
              const item = capacity[hospital.id]?.[type];
              return <Text key={type} style={s.detailLine}>{label}: {count(hospital, type, localKey)} available · {item?.occupied ?? (hospital.resources as any)[localKey]?.occupied ?? 0} occupied · {item?.total ?? (hospital.resources as any)[localKey]?.total ?? count(hospital, type, localKey)} total</Text>;
            })}
            <Text style={s.detailLine}>Services: {hospital.specialties.join(', ')}</Text>
            <Text style={s.detailLine}>Estimated charges: {hospital.minDailyChargePKR ? `PKR ${hospital.minDailyChargePKR.toLocaleString()}–${hospital.maxDailyChargePKR?.toLocaleString() ?? '—'} / day` : 'Not listed'}</Text>
          </>}
        </View>;
        })}
        {visibleHospitals.length===0&&<View style={s.empty}><Text style={s.emptyTitle}>No hospitals match this filter</Text><Text style={s.muted}>Try another review status or search term.</Text></View>}
      </> : <>
        <Text style={s.sectionTitle}>All resource requests</Text>
        {requests.slice(0, 30).map(request => <RequestCard key={request.id} request={request} />)}
        {requests.length === 0 && <View style={s.empty}><Text style={s.emptyTitle}>No requests recorded</Text></View>}
      </>}
      <Text style={s.sectionTitle}>System activity</Text>
      {appointments.slice(0, 8).map(appointment => <AppointmentCard key={appointment.id} appointment={appointment} />)}
    </>}

    {role === 'Ambulance / emergency worker' && <>
      <View style={s.statsRow}>
        <View style={s.statCard}><Text style={s.statNumber}>{emergencyHospitals.length}</Text><Text style={s.statLabel}>Hospitals with emergency beds</Text></View>
        <View style={s.statCard}><Text style={s.statNumber}>{availableEmergency}</Text><Text style={s.statLabel}>Emergency beds available</Text></View>
      </View>
      <TextInput value={hospitalQuery} onChangeText={setHospitalQuery} style={s.searchInput} placeholder="Search nearby hospitals or area" />
      <Text style={s.sectionTitle}>Compare emergency resources</Text>
      {visibleHospitals.filter(h => emergencyResources.some(([type]) => count(h, type, type === 'emergency_bed' ? 'emergencyBeds' : type === 'icu_bed' ? 'icuBeds' : type === 'ventilator' ? 'ventilators' : type === 'trauma_bed' ? 'traumaBeds' : 'dialysisMachines') > 0)).map(hospital => <View key={hospital.id} style={s.card}>
        <Text style={s.cardTitle}>{hospital.name}</Text><Text style={s.muted}>{hospital.area} · {hospital.phone}</Text>
        <View style={s.resourceChips}>{emergencyResources.map(([type, label]) => {
          const localKey = type === 'emergency_bed' ? 'emergencyBeds' : type === 'icu_bed' ? 'icuBeds' : type === 'ventilator' ? 'ventilators' : type === 'trauma_bed' ? 'traumaBeds' : 'dialysisMachines';
          const available = count(hospital, type, localKey);
          return <View key={type} style={s.resourceChip}><Text style={s.resourceChipText}>{label}: {available}</Text></View>;
        })}</View>
        <TextInput value={referralReason} onChangeText={setReferralReason} style={s.reasonInput} placeholder="Patient need or transfer note (optional)" />
        <View style={s.buttonRow}>{emergencyResources.filter(([type]) => count(hospital, type, type === 'emergency_bed' ? 'emergencyBeds' : type === 'icu_bed' ? 'icuBeds' : type === 'ventilator' ? 'ventilators' : type === 'trauma_bed' ? 'traumaBeds' : 'dialysisMachines') > 0).map(([type, label]) => <TouchableOpacity key={type} onPress={() => onCreateReferral(hospital.id, type, referralReason)} style={s.primarySmallButton}><Text style={s.primarySmallButtonText}>Refer · {label}</Text></TouchableOpacity>)}</View>
      </View>)}
      <Text style={s.sectionTitle}>My referrals</Text>
      {requests.filter(request => request.request_kind === 'referral').map(request => <RequestCard key={request.id} request={request}
        onConfirmTransfer={() => onConfirmTransfer(request.id)} />)}
      {requests.filter(request => request.request_kind === 'referral').length === 0 && <View style={s.empty}><Text style={s.emptyTitle}>No referrals yet</Text><Text style={s.muted}>Send a referral to track hospital responses here.</Text></View>}
    </>}
  </>;
}

function RequestCard({ request, onAccept, onReject, onConfirmTransfer }: {
  request: ResourceRequest; onAccept?: () => void; onReject?: () => void; onConfirmTransfer?: () => void;
}) {
  const status = request.status === 'transfer_confirmed' ? 'Transfer confirmed' : request.status[0].toUpperCase() + request.status.slice(1);
  return <View style={s.card}>
    <View style={[s.rowBetween,s.requestCardHeader]}><View style={{ flex: 1, minWidth: 0 }}><Text style={s.cardTitle} numberOfLines={2}>{request.hospital_name}</Text><Text style={s.muted}>{resourceLabel(request.resource_type)} · {request.request_kind === 'referral' ? 'Emergency referral' : 'Bed / room request'}</Text></View><Text style={[s.status,s.statusText, request.status === 'pending' ? s.statusPending : s.statusDone]}>{status}</Text></View>
    <Text style={s.detailLine}>Requested by {request.requester_name} · {roleLabel(request.requester_role)}</Text>
    {!!request.requester_phone && <Text style={s.detailLine}>Phone: {request.requester_phone}</Text>}
    {!!request.requester_email && <Text style={s.detailLine}>Email: {request.requester_email}</Text>}
    {!!request.reason && <Text style={s.detailLine}>Note: {request.reason}</Text>}
    {request.amount_pkr != null && <Text style={s.detailLine}>Estimated amount: PKR {request.amount_pkr.toLocaleString()} / day</Text>}
    <Text style={s.muted}>Submitted {displayTime(request.created_at)}</Text>
    {request.status === 'pending' && onAccept && onReject && <View style={s.buttonRow}>
      <TouchableOpacity onPress={onAccept} style={s.primarySmallButton}><Text style={s.primarySmallButtonText}>Accept request</Text></TouchableOpacity>
      <TouchableOpacity onPress={onReject} style={s.rejectButton}><Text style={s.rejectButtonText}>Reject</Text></TouchableOpacity>
    </View>}
    {request.status === 'accepted' && request.request_kind === 'referral' && onConfirmTransfer && <TouchableOpacity onPress={onConfirmTransfer} style={s.primaryButton}><Text style={s.primaryButtonText}>Confirm patient transfer</Text></TouchableOpacity>}
  </View>;
}

function AppointmentCard({ appointment }: { appointment: AppointmentRecord }) {
  const hospital = hospitalDataset.records.find(item => item.id === appointment.hospital_id);
  return <View style={s.card}>
    <View style={[s.rowBetween,s.requestCardHeader]}><Text style={[s.cardTitle,s.hospitalTitle]} numberOfLines={2}>{hospital?.name ?? appointment.hospital_id}</Text><Text style={[s.status,s.statusText,s.statusDone]}>Confirmed</Text></View>
    <Text style={s.muted}>{appointment.specialty} · {appointment.doctor_name}</Text>
    <Text style={s.detailLine}>Appointment: {displayTime(appointment.appointment_at)}</Text>
    <Text style={s.detailLine}>Care: {appointment.care_type}</Text>
    {appointment.amount_pkr != null && <Text style={s.detailLine}>Estimated amount: PKR {appointment.amount_pkr.toLocaleString()} / day</Text>}
    <Text style={s.muted}>Booked {displayTime(appointment.created_at)}</Text>
  </View>;
}

const s = StyleSheet.create({
  eyebrow: { color: '#27836A', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginTop: 3 },
  title: { color: '#183D34', fontSize: 26, lineHeight: 31, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#6B807A', fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 18 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 10 },
  sectionTitle: { color: '#1D453A', fontSize: 16, fontWeight: '800', marginTop: 8, marginBottom: 9 },
  sectionMeta: { color: '#899791', fontSize: 10, fontWeight: '600' },
  hospitalPicker: { gap: 8, paddingBottom: 10 },
  hospitalChip: { width: 190, padding: 11, borderRadius: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5ECE8' },
  hospitalChipSelected: { backgroundColor: '#EAF5F0', borderColor: '#98CBB7' },
  hospitalChipText: { color: '#52675F', fontSize: 10, fontWeight: '700' },
  hospitalChipTextSelected: { color: '#176A54' }, hospitalChipArea: { color: '#87958F', fontSize: 9, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E8EFEB', padding: 14, marginBottom: 10 },
  cardTitle: { color: '#25483D', fontSize: 12, fontWeight: '800' }, muted: { color: '#87958F', fontSize: 10, lineHeight: 15, marginTop: 4 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  resourceCard: { width: '48%', flexGrow: 1, minWidth: 140, borderRadius: 12, borderWidth: 1, borderColor: '#EDF1EF', padding: 10, backgroundColor: '#FCFDFC' },
  resourceTitle: { color: '#52675F', fontSize: 10, fontWeight: '700' }, resourceAvailable: { color: '#176A54', fontSize: 19, fontWeight: '800', marginTop: 5 }, resourceAvailableLabel: { color: '#72847C', fontSize: 10, fontWeight: '600' }, resourceMeta: { color: '#87958F', fontSize: 8, marginTop: 3 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  smallButton: { borderWidth: 1, borderColor: '#DCE8E2', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 }, smallButtonText: { color: '#52675F', fontSize: 9, fontWeight: '700' },
  primarySmallButton: { backgroundColor: '#126B54', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 }, primarySmallButtonText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  rejectButton: { backgroundColor: '#FFF2F0', borderColor: '#F0D3CF', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }, rejectButtonText: { color: '#A44437', fontSize: 9, fontWeight: '800' },
  countBadge: { color: '#966411', backgroundColor: '#FFF4DF', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontWeight: '800' },
  empty: { padding: 16, borderRadius: 14, borderColor: '#E8EFEB', borderWidth: 1, backgroundColor: '#fff', marginBottom: 12 }, emptyTitle: { color: '#25483D', fontSize: 12, fontWeight: '800' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, statCard: { flex: 1, minWidth: 100, padding: 12, backgroundColor: '#fff', borderRadius: 13, borderWidth: 1, borderColor: '#E8EFEB' }, statNumber: { color: '#176A54', fontSize: 21, fontWeight: '800' }, statLabel: { color: '#74867E', fontSize: 9, lineHeight: 13, marginTop: 3 },
  tabs: { flexDirection: 'row', gap: 7, marginBottom: 12 }, tab: { flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: '#E9EFEC', borderRadius: 10 }, tabSelected: { backgroundColor: '#E2F2EA' }, tabText: { color: '#71827A', fontSize: 10, fontWeight: '700' }, tabTextSelected: { color: '#176A54' },
  searchInput: { minHeight: 42, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E3EBE7', paddingHorizontal: 12, color: '#294A41', marginBottom: 11, fontSize: 11 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, expand: { color: '#176A54', fontSize: 22, fontWeight: '700', paddingHorizontal: 5 }, hospitalSummary: { color: '#536A60', fontSize: 10, lineHeight: 16, marginTop: 8 }, divider: { height: 1, backgroundColor: '#EDF1EF', marginVertical: 9 }, detailLine: { color: '#5F746B', fontSize: 10, lineHeight: 15, marginTop: 5 },
  status: { fontSize: 9, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, overflow: 'hidden' }, statusPending: { color: '#956313', backgroundColor: '#FFF4DF' }, statusDone: { color: '#176A54', backgroundColor: '#EAF5F0' },
  resourceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }, resourceChip: { backgroundColor: '#EAF5F0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }, resourceChipText: { color: '#28735E', fontSize: 9, fontWeight: '700' }, reasonInput: { minHeight: 40, marginTop: 10, backgroundColor: '#FAFCFB', borderRadius: 9, borderWidth: 1, borderColor: '#E3EBE7', paddingHorizontal: 10, fontSize: 10, color: '#294A41' },
  requestCardHeader: { alignItems: 'flex-start' }, statusText: { maxWidth: '42%', flexShrink: 1, textAlign: 'right', lineHeight: 13 }, hospitalTitle: { flex: 1, minWidth: 0 },
  requestHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, refreshButton: { borderRadius: 10, backgroundColor: '#EAF5F0', paddingHorizontal: 9, paddingVertical: 6 }, refreshButtonText: { color: '#176A54', fontSize: 9, fontWeight: '800' }, syncNotice: { backgroundColor: '#FFF4DF', borderRadius: 10, padding: 10, marginBottom: 9 }, syncNoticeText: { color: '#805C20', fontSize: 10, lineHeight: 15 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 }, filterChip: { borderWidth: 1, borderColor: '#E3EBE7', backgroundColor: '#fff', borderRadius: 15, paddingVertical: 7, paddingHorizontal: 10 }, filterChipActive: { backgroundColor: '#E5F4EE', borderColor: '#B5DDCD' }, filterChipText: { color: '#6A7E77', fontSize: 9, fontWeight: '700' }, filterChipTextActive: { color: '#176A54' },
  reviewBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 }, reviewBadge: { overflow: 'hidden', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, fontSize: 8, fontWeight: '800', textTransform: 'capitalize' }, reviewVerified: { color: '#176A54', backgroundColor: '#EAF5F0' }, reviewNeedsReview: { color: '#956313', backgroundColor: '#FFF4DF' }, reviewActive: { color: '#53675E', backgroundColor: '#EFF3F1' }, reviewInactive: { color: '#A44437', backgroundColor: '#FFF2F0' },
  primaryButton: { alignItems: 'center', marginTop: 10, backgroundColor: '#126B54', borderRadius: 9, padding: 10 }, primaryButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
