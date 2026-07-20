import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Briefcase, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

type PortalOrder = Awaited<ReturnType<typeof api.getVendorOrder>>;

export function VendorPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getVendorOrder(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Order not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const respond = async (action: 'accept' | 'decline') => {
    if (!token) return;
    setBusy(true);
    try {
      if (action === 'accept') await api.acceptVendorOrder(token);
      else await api.declineVendorOrder(token);
      setDone(action === 'accept' ? 'ACCEPTED' : 'DECLINED');
      const refreshed = await api.getVendorOrder(token);
      setData(refreshed);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-hoterra-offwhite bg-dot-grid px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-hoterra-navy font-bold text-hoterra-gold">
            H
          </div>
          <div>
            <div className="font-bold tracking-wide text-hoterra-navy">HOTERRA</div>
            <div className="text-xs text-gray-500">Vendor Order Portal</div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {loading && <p className="text-sm text-gray-500">Loading order…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {data && (
            <>
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hoterra-navy/5">
                  <Briefcase className="h-5 w-5 text-hoterra-steel" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-hoterra-navy">{data.order.code}</h1>
                  <p className="text-sm text-gray-500">For {data.vendor.name}</p>
                </div>
              </div>

              <dl className="mb-6 grid grid-cols-2 gap-3 text-sm">
                <Item label="Hotel" value={data.order.hotelName} />
                <Item label="Department" value={data.order.department} />
                <Item label="Position" value={data.order.position} />
                <Item label="Quantity" value={String(data.order.quantity)} />
                <Item label="Date" value={formatDate(data.order.workDate)} />
                <Item label="Shift" value={data.order.shift} />
              </dl>

              {data.order.comment && (
                <p className="mb-6 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  {data.order.comment}
                </p>
              )}

              <div className="mb-4 text-xs text-gray-500">
                Invite: {data.inviteStatus}
                {done && ` · You ${done.toLowerCase()} this order`}
              </div>

              {data.canRespond ? (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => respond('accept')}
                    className="btn-primary flex-1 justify-center disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Accept order
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => respond('decline')}
                    className="btn-secondary flex-1 justify-center text-red-600 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Decline
                  </button>
                </div>
              ) : (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-center text-sm text-gray-600">
                  No action available ({data.inviteStatus})
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-hoterra-navy">{value}</dd>
    </div>
  );
}
