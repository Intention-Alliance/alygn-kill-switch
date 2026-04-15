import { useState, useEffect, useCallback } from 'react';
import type { Segment, Rule, Operator, AuditEntry } from './types';
import { fetchFlag, updateFlag, createFlag, fetchFlagAudit } from './api';

interface FlagEditorProps {
  flagId?: string;
  onClose: () => void;
  onSave: () => void;
}

const OPERATORS: Operator[] = ['eq', 'neq', 'contains', 'starts_with', 'gt', 'lt', 'in'];

export function FlagEditor({ flagId, onClose, onSave }: FlagEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'audit'>('edit');
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
    enabled: true,
    value: '' as string | number | boolean,
    valueType: 'boolean' as 'boolean' | 'string' | 'number',
    rolloutPercentage: 100,
    segments: [] as Segment[],
  });

  const loadFlag = useCallback(async () => {
    if (!flagId) return;
    try {
      setLoading(true);
      setError(null);
      const flag = await fetchFlag(flagId);
      setFormData({
        name: flag.name,
        key: flag.key,
        description: flag.description,
        enabled: flag.enabled,
        value: flag.value,
        valueType: typeof flag.value as 'boolean' | 'string' | 'number',
        rolloutPercentage: flag.rolloutPercentage,
        segments: flag.segments,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flag');
    } finally {
      setLoading(false);
    }
  }, [flagId]);

  const loadAudit = useCallback(async () => {
    if (!flagId) return;
    try {
      const entries = await fetchFlagAudit(flagId);
      setAuditLog(entries);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    }
  }, [flagId]);

  useEffect(() => {
    if (flagId) {
      loadFlag();
    }
  }, [loadFlag, flagId]);

  useEffect(() => {
    if (activeTab === 'audit' && flagId) {
      loadAudit();
    }
  }, [activeTab, loadAudit, flagId]);

  const handleValueChange = (newValue: string) => {
    let parsed: string | number | boolean = newValue;
    if (formData.valueType === 'boolean') {
      parsed = newValue === 'true';
    } else if (formData.valueType === 'number') {
      parsed = parseFloat(newValue) || 0;
    }
    setFormData((prev) => ({ ...prev, value: parsed }));
  };

  const addSegment = () => {
    const newSegment: Segment = {
      id: `seg_${Date.now()}`,
      name: 'New Segment',
      rules: [],
      description: '',
    };
    setFormData((prev) => ({ ...prev, segments: [...prev.segments, newSegment] }));
  };

  const removeSegment = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      segments: prev.segments.filter((_, i) => i !== index),
    }));
  };

  const addRule = (segmentIndex: number) => {
    const newRule: Rule = { field: '', operator: 'eq', value: '' };
    setFormData((prev) => ({
      ...prev,
      segments: prev.segments.map((seg, i) =>
        i === segmentIndex ? { ...seg, rules: [...seg.rules, newRule] } : seg
      ),
    }));
  };

  const updateRule = (segmentIndex: number, ruleIndex: number, updates: Partial<Rule>) => {
    setFormData((prev) => ({
      ...prev,
      segments: prev.segments.map((seg, i) =>
        i === segmentIndex
          ? {
              ...seg,
              rules: seg.rules.map((rule, j) =>
                j === ruleIndex ? { ...rule, ...updates } : rule
              ),
            }
          : seg
      ),
    }));
  };

  const removeRule = (segmentIndex: number, ruleIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      segments: prev.segments.map((seg, i) =>
        i === segmentIndex
          ? { ...seg, rules: seg.rules.filter((_, j) => j !== ruleIndex) }
          : seg
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: formData.name,
        key: formData.key,
        description: formData.description,
        enabled: formData.enabled,
        value: formData.value,
        rolloutPercentage: formData.rolloutPercentage,
        segments: formData.segments,
      };

      if (flagId) {
        await updateFlag(flagId, payload);
      } else {
        await createFlag(payload);
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save flag');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">
            {flagId ? 'Edit Flag' : 'Create Flag'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'edit'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Edit
          </button>
          {flagId && (
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'audit'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Audit Trail
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
              {error}
            </div>
          )}

          {activeTab === 'edit' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Key *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.key}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, key: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Value Configuration */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value Type
                  </label>
                  <select
                    value={formData.valueType}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        valueType: e.target.value as 'boolean' | 'string' | 'number',
                        value: e.target.value === 'boolean' ? true : '',
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="boolean">Boolean</option>
                    <option value="string">String</option>
                    <option value="number">Number</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value
                  </label>
                  {formData.valueType === 'boolean' ? (
                    <select
                      value={String(formData.value)}
                      onChange={(e) => handleValueChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (
                    <input
                      type={formData.valueType === 'number' ? 'number' : 'text'}
                      value={String(formData.value)}
                      onChange={(e) => handleValueChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>

              {/* Enabled & Rollout */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={formData.enabled}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                    Enabled
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rollout: {formData.rolloutPercentage}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formData.rolloutPercentage}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        rolloutPercentage: parseInt(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </div>
              </div>

              {formData.enabled && formData.rolloutPercentage < 100 && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-700 rounded-md text-sm text-yellow-400">
                  Partial rollout: {formData.rolloutPercentage}% of users will see this flag
                </div>
              )}

              {/* Segments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Segments
                  </label>
                  <button
                    type="button"
                    onClick={addSegment}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add Segment
                  </button>
                </div>
                <div className="space-y-4">
                  {formData.segments.map((segment, segIndex) => (
                    <div
                      key={segment.id}
                      className="border border-gray-200 rounded-md p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <input
                          type="text"
                          value={segment.name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              segments: prev.segments.map((s, i) =>
                                i === segIndex ? { ...s, name: e.target.value } : s
                              ),
                            }))
                          }
                          placeholder="Segment name"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeSegment(segIndex)}
                          className="ml-2 text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={segment.description}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            segments: prev.segments.map((s, i) =>
                              i === segIndex ? { ...s, description: e.target.value } : s
                            ),
                          }))
                        }
                        placeholder="Description"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm mb-2"
                      />
                      <div className="space-y-2">
                        {segment.rules.map((rule, ruleIndex) => (
                          <div key={ruleIndex} className="flex gap-2">
                            <input
                              type="text"
                              value={rule.field}
                              onChange={(e) =>
                                updateRule(segIndex, ruleIndex, { field: e.target.value })
                              }
                              placeholder="Field"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                            <select
                              value={rule.operator}
                              onChange={(e) =>
                                updateRule(segIndex, ruleIndex, {
                                  operator: e.target.value as Operator,
                                })
                              }
                              className="px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              {OPERATORS.map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={rule.value}
                              onChange={(e) =>
                                updateRule(segIndex, ruleIndex, { value: e.target.value })
                              }
                              placeholder="Value"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeRule(segIndex, ruleIndex)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addRule(segIndex)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        + Add Rule
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {auditLog.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No audit entries</div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Timestamp
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          User
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Action
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Change
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Trace ID
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {auditLog.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(entry.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{entry.userId}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{entry.action}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            <span className="text-red-600">{entry.oldValue}</span>
                            <span className="mx-2">→</span>
                            <span className="text-green-600">{entry.newValue}</span>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-500">
                            {entry.traceId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}