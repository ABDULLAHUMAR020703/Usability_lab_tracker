import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFetch } from '../hooks/hooks';
import { PageHeader, Spinner, ErrorBox } from '../components/ui';
import ResearchForm from '../components/ResearchForm';

export default function ResearchEdit() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { data, loading, error } = useFetch(id ? `/research/${id}` : null);
  if (id && loading) return <Spinner />;
  if (id && error) return <ErrorBox error={error} />;
  const initial = id ? data : { start_date: sp.get('start') || '', end_date: sp.get('end') || sp.get('start') || '' };
  return (
    <>
      <PageHeader title={id ? `Edit ${data.research_code}` : 'New research study'} subtitle={id ? data.title : 'Enter the study details. You can move it through the lifecycle afterwards.'}
        crumbs={[{ label: 'Research Tracker', to: '/research' }, ...(id ? [{ label: data.research_code, to: `/research/${id}` }, { label: 'Edit' }] : [{ label: 'New' }])]} />
      <ResearchForm key={id || 'new'} initial={initial} onCancel={() => nav(id ? `/research/${id}` : '/research')} onSaved={(s) => nav(`/research/${s.id}`)} saveLabel={id ? 'Save changes' : 'Create research'} />
    </>
  );
}
