import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import * as serviceApi from '../services/serviceApi.js';
import { getErrorMessage } from '../services/apiClient.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import Loader from '../components/Loader.jsx';
import { toList } from '../utils/helpers.js';
import { applyDemoLocation, buildOfficeSearchParams, getDemoLocation } from '../utils/officeLocation.js';

const safeHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

export default function Offices() {
  const [searchParams] = useSearchParams();
  const { data: svcData } = useFetch(() => serviceApi.searchServices({ page: 1, limit: 100 }), []);
  const services = toList(svcData, 'services');

  const [form, setForm] = useState({
    serviceId: searchParams.get('serviceId') || '',
    city: '',
    state: '',
    latitude: '',
    longitude: '',
    radiusKm: '10',
  });
  const [offices, setOffices] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const [searchedRadiusKm, setSearchedRadiusKm] = useState(null);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const useMyLocation = () => {
    setError('');
    setLocationMessage('');
    getDemoLocation(typeof navigator === 'undefined' ? null : navigator.geolocation)
      .then((coords) => {
        setForm((currentForm) => applyDemoLocation(currentForm, coords));
        setLocationMessage('Location captured successfully. City and state are demo defaults.');
      })
      .catch((locationError) => setError(locationError.message));
  };

  const runSearch = async ({ withoutRadius = false } = {}) => {
    setLoading(true);
    setError('');
    const params = buildOfficeSearchParams(form, { withoutRadius });
    setSearchedRadiusKm(params.radiusKm || null);
    try {
      setOffices(toList(await serviceApi.searchOffices(params)));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const search = (e) => {
    e.preventDefault();
    return runSearch();
  };

  const mapsUrl = (o) =>
    Number.isFinite(o.latitude) && Number.isFinite(o.longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.name} ${o.address || ''} ${o.city} ${o.state || ''} ${o.pincode || ''}`.trim())}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Find Offices</h1>

      <form onSubmit={search} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select className="input lg:col-span-2" name="serviceId" value={form.serviceId} onChange={change}>
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input className="input" name="city" placeholder="City" value={form.city} onChange={change} />
        <input className="input" name="state" placeholder="State" value={form.state} onChange={change} />
        <input className="input" name="latitude" placeholder="Latitude" value={form.latitude} onChange={change} />
        <input className="input" name="longitude" placeholder="Longitude" value={form.longitude} onChange={change} />
        <input className="input" type="number" min="1" name="radiusKm" placeholder="Radius (km)" value={form.radiusKm} onChange={change} />
        <button type="button" className="btn-secondary" onClick={useMyLocation}>📍 Use my location</button>
        <button className="btn-primary sm:col-span-2 lg:col-span-4 lg:w-fit">Search offices</button>
      </form>

      <ErrorMessage message={error} />
      {locationMessage && <p className="text-sm text-green-700" role="status">{locationMessage}</p>}
      {loading && <Loader />}
      {offices && !loading && offices.length === 0 && (
        searchedRadiusKm ? (
          <div className="space-y-2 py-8 text-center text-slate-500">
            <p>No offices matched these filters within {searchedRadiusKm} km. Radius search requires offices with valid coordinates.</p>
            <button type="button" className="btn-secondary" onClick={() => runSearch({ withoutRadius: true })}>
              Search without radius
            </button>
          </div>
        ) : <p className="py-8 text-center text-slate-400">No offices found.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {offices?.map((o) => (
          <div key={o.id} className="card space-y-1 text-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{o.name}</h3>
              {typeof o.distanceKm === 'number' && (
                <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  {o.distanceKm} km straight-line
                </span>
              )}
            </div>
            <p className="text-slate-600">
              {[o.address, o.city, o.state, o.pincode].filter(Boolean).join(', ')}
            </p>
            {o.phone && <p>📞 {o.phone}</p>}
            {o.workingHours && <p>🕒 {o.workingHours}</p>}
            {o.coordinateApproximate && <p className="text-xs text-slate-500">Approximate map location</p>}
            {o.services?.length > 0 && (
              <div className="text-slate-600">
                <span>Services listed: </span>
                {o.services.map((service, index) => {
                  const sourceUrl = safeHttpsUrl(service.sourceUrl);
                  return (
                    <span key={`${service.id}-${index}`} className="mr-2">
                      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{service.name}</a> : service.name}
                      {index < o.services.length - 1 && ', '}
                    </span>
                  );
                })}
              </div>
            )}
            {safeHttpsUrl(o.sourceUrl) && (
              <p className="text-xs text-slate-500">
                <a href={safeHttpsUrl(o.sourceUrl)} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                  Source checked: {o.sourceName || 'official listing'}
                </a>
                {o.verifiedAt && ` · verified ${new Date(o.verifiedAt).toLocaleDateString()}`}
              </p>
            )}
            <a href={mapsUrl(o)} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-indigo-600 underline">
              Open in Maps ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
