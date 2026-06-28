import { useMemo, useRef, useState } from 'react';
import type { Document, Role, Signature, SignaturePlacement } from '@/types';
import { ROLE_LABELS } from '@/types';
import {
  createPlacementId,
  pagesForPlacement,
  parseSignaturePlacements,
  signatureForPlacement,
  uploadUrl,
} from '@/lib/signatures';
import { cn } from '@/lib/utils';

type PreviewDoc = Pick<
  Document,
  'title' | 'code' | 'version' | 'description' | 'content' | 'pageCount' | 'signaturePlacement' | 'status'
>;

interface DocumentPreviewCanvasProps {
  document: PreviewDoc;
  signatures?: Signature[];
  mode?: 'view' | 'design';
  placements?: SignaturePlacement[];
  onPlacementsChange?: (placements: SignaturePlacement[]) => void;
  onPageCountChange?: (count: number) => void;
  showThumbnails?: boolean;
  highlightRole?: Role | null;
  className?: string;
}

function DocumentPageBody({ doc, pageIndex, pageCount }: { doc: PreviewDoc; pageIndex: number; pageCount: number }) {
  if (pageIndex === 0) {
    return (
      <>
        <div className="mb-8 flex items-center justify-between border-b-2 border-hoterra-navy pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hoterra-navy text-lg font-bold text-hoterra-gold">
              H
            </div>
            <div>
              <div className="font-bold text-hoterra-navy">HOTERRA Hotels & Resorts</div>
              <div className="text-xs text-gray-500">{doc.code}</div>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">Version {doc.version}</div>
        </div>
        <h2 className="mb-6 text-xl font-bold text-hoterra-navy">{doc.title}</h2>
        <div className="space-y-4 text-sm text-gray-700">
          <section>
            <h3 className="mb-2 font-bold text-hoterra-navy">1. PURPOSE</h3>
            <p>{doc.description || 'Document purpose and scope.'}</p>
          </section>
          <section>
            <h3 className="mb-2 font-bold text-hoterra-navy">2. SCOPE</h3>
            <p>This procedure applies to all staff handling related operations at HOTERRA Hotels & Resorts properties.</p>
          </section>
          <section>
            <h3 className="mb-2 font-bold text-hoterra-navy">3. PROCEDURE</h3>
            <p className="whitespace-pre-wrap">
              {doc.content || 'Full document content appears here for review before approval.'}
            </p>
          </section>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4 text-sm text-gray-700">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 text-xs text-gray-500">
        <span>{doc.code}</span>
        <span>
          Page {pageIndex + 1} of {pageCount}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-gray-600">
        {pageIndex === pageCount - 1
          ? 'Continued content and appendices appear on subsequent pages.'
          : 'Continued from previous page…'}
      </p>
    </div>
  );
}

function SignatureOverlay({
  placement,
  signature,
  designMode,
  highlighted,
  onRemove,
}: {
  placement: SignaturePlacement;
  signature?: Signature;
  designMode: boolean;
  highlighted: boolean;
  onRemove?: () => void;
}) {
  const imageSrc = signature?.imagePath ? uploadUrl(signature.imagePath) : null;

  return (
    <div
      className={cn(
        'absolute overflow-hidden rounded border bg-white/90',
        designMode
          ? 'cursor-move border-dashed border-amber-400 bg-amber-50/80'
          : signature
            ? 'border-green-300 shadow-sm'
            : 'border-gray-300 border-dashed bg-gray-50/80',
        highlighted && 'ring-2 ring-hoterra-gold'
      )}
      style={{
        left: `${placement.x}%`,
        top: `${placement.y}%`,
        width: `${placement.width}%`,
        height: `${placement.height}%`,
      }}
      title={placement.label}
    >
      {imageSrc ? (
        <img src={imageSrc} alt={signature?.fullName ?? placement.label} className="h-full w-full object-contain p-0.5" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-1 text-center">
          <span className="text-[9px] font-medium leading-tight text-gray-500">{placement.label}</span>
          {!designMode && <span className="text-[8px] text-gray-400">Sign here</span>}
        </div>
      )}
      {designMode && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-0.5 top-0.5 rounded bg-white px-1 text-[10px] text-red-600 shadow hover:bg-red-50"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function DocumentPreviewCanvas({
  document: doc,
  signatures = [],
  mode = 'view',
  placements: controlledPlacements,
  onPlacementsChange,
  onPageCountChange,
  showThumbnails = true,
  highlightRole = null,
  className,
}: DocumentPreviewCanvasProps) {
  const pageCount = Math.max(1, doc.pageCount ?? 1);
  const [activePage, setActivePage] = useState(1);
  const pageRef = useRef<HTMLDivElement>(null);

  const parsedPlacements = useMemo(
    () => controlledPlacements ?? parseSignaturePlacements(doc.signaturePlacement),
    [controlledPlacements, doc.signaturePlacement]
  );

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);

  const handlePageClick = (event: React.MouseEvent<HTMLDivElement>, pageNumber: number) => {
    if (mode !== 'design' || !onPlacementsChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const role = highlightRole ?? 'HOD';
    const placement: SignaturePlacement = {
      id: createPlacementId(role),
      role,
      label: ROLE_LABELS[role],
      page: 'all',
      x: Math.max(2, Math.min(74, x - 12)),
      y: Math.max(2, Math.min(88, y - 4)),
      width: 24,
      height: 9,
    };
    onPlacementsChange([...parsedPlacements, placement]);
  };

  return (
    <div className={cn('flex h-full gap-3', className)}>
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
          <span>
            Page {activePage} of {pageCount}
          </span>
          {mode === 'design' && (
            <div className="flex items-center gap-2">
              <label className="text-gray-500">Pages</label>
              <input
                type="number"
                min={1}
                max={20}
                value={pageCount}
                onChange={(e) => onPageCountChange?.(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                className="w-14 rounded border border-gray-200 px-2 py-0.5 text-xs"
              />
            </div>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          {pages.map((pageNumber) => (
            <div
              key={pageNumber}
              id={`doc-page-${pageNumber}`}
              className={cn(
                'mb-4 last:mb-0',
                mode === 'design' && activePage !== pageNumber && 'hidden'
              )}
            >
              <div
                ref={pageNumber === activePage ? pageRef : undefined}
                className={cn(
                  'relative aspect-[8.5/11] bg-white p-12',
                  mode === 'design' && 'cursor-crosshair ring-1 ring-amber-200'
                )}
                onClick={(e) => handlePageClick(e, pageNumber)}
              >
                <DocumentPageBody doc={doc} pageIndex={pageNumber - 1} pageCount={pageCount} />

                {parsedPlacements.flatMap((placement) => {
                  const targetPages = pagesForPlacement(pageCount, placement.page);
                  if (!targetPages.includes(pageNumber)) return [];

                  const signed = signatureForPlacement(signatures, placement.id);
                  return [
                    <SignatureOverlay
                      key={`${placement.id}-${pageNumber}`}
                      placement={placement}
                      signature={signed}
                      designMode={mode === 'design'}
                      highlighted={highlightRole === placement.role}
                      onRemove={
                        mode === 'design' && onPlacementsChange
                          ? () => onPlacementsChange(parsedPlacements.filter((p) => p.id !== placement.id))
                          : undefined
                      }
                    />,
                  ];
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showThumbnails && pageCount > 1 && (
        <div className="hidden w-16 shrink-0 space-y-2 lg:block">
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setActivePage(p);
                document.getElementById(`doc-page-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={cn(
                'aspect-[8.5/11] w-full rounded border bg-white transition-colors',
                p === activePage ? 'border-hoterra-steel ring-1 ring-hoterra-steel' : 'border-gray-200 hover:border-gray-300'
              )}
              title={`Page ${p}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
