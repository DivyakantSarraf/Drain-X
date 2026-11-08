import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../models/incident.dart';
import '../../widgets/severity_badge.dart';
import '../../widgets/status_badge.dart';

class MunicipalIncidentDetailScreen extends StatefulWidget {
  final String incidentId;
  final String officerName;

  const MunicipalIncidentDetailScreen({
    Key? key,
    required this.incidentId,
    required this.officerName,
  }) : super(key: key);

  @override
  State<MunicipalIncidentDetailScreen> createState() => _MunicipalIncidentDetailScreenState();
}

class _MunicipalIncidentDetailScreenState extends State<MunicipalIncidentDetailScreen> {
  final ApiClient _apiClient = ApiClient();
  Incident? _incident;
  bool _isLoading = true;
  String? _errorMessage;

  String? _selectedNextStatus;
  String? _selectedAssignedTeam;
  final TextEditingController _notesController = TextEditingController();
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _fetchDetails();
  }

  Future<void> _fetchDetails() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final incident = await _apiClient.getIncident(widget.incidentId);
      setState(() {
        _incident = incident;
        _selectedNextStatus = incident.status;
        _selectedAssignedTeam = incident.assignedTo;
        _notesController.text = incident.municipalNotes ?? '';
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _saveWorkflowUpdates() async {
    if (_incident == null) return;

    setState(() {
      _isSaving = true;
    });

    try {
      final updatedIncident = await _apiClient.updateIncident(
        _incident!.id,
        status: _selectedNextStatus != _incident!.status ? _selectedNextStatus : null,
        assignedTo: _selectedAssignedTeam,
        municipalNotes: _notesController.text.trim(),
      );

      setState(() {
        _incident = updatedIncident;
        _selectedNextStatus = updatedIncident.status;
        _selectedAssignedTeam = updatedIncident.assignedTo;
        _notesController.text = updatedIncident.municipalNotes ?? '';
        _isSaving = false;
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: Color(0xFF16A34A),
          content: Text('Ticket workflow updates saved successfully.'),
        ),
      );
    } catch (e) {
      setState(() {
        _isSaving = false;
      });
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Workflow Update Failed', style: TextStyle(color: Colors.red)),
          content: Text(e.toString(), style: const TextStyle(fontSize: 12)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: Text(_incident != null ? 'Ticket: ${_incident!.id}' : 'Incident Triage'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchDetails,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)))
              : _incident == null
                  ? const Center(child: Text('Incident not found'))
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Header Card
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      _incident!.id,
                                      style: const TextStyle(
                                        fontFamily: 'monospace',
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF0284C7),
                                      ),
                                    ),
                                    Row(
                                      children: [
                                        SeverityBadge(severity: _incident!.severity),
                                        const SizedBox(width: 6),
                                        StatusBadge(status: _incident!.status),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  IncidentConstants.formatCategory(_incident!.category),
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Reported by ${_incident!.reporterName ?? 'Citizen Anonymous'} (${_incident!.source}) • ${dateFormat.format(_incident!.createdAt.toLocal())}',
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Incident Details Card
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'HAZARD REPORT DETAILS',
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _incident!.description,
                                  style: const TextStyle(fontSize: 13, color: Color(0xFF1E293B), height: 1.4),
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  children: [
                                    const Icon(Icons.place, size: 16, color: Color(0xFF0891B2)),
                                    const SizedBox(width: 4),
                                    Text(
                                      'Coordinates: ${_incident!.latitude.toStringAsFixed(4)}°N, ${_incident!.longitude.toStringAsFixed(4)}°E',
                                      style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: Color(0xFF475569)),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Photographic Evidence Viewer Card
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text(
                                      'PHOTOGRAPHIC EVIDENCE',
                                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                                    ),
                                    Text(
                                      '${_incident!.photos.length} attached',
                                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                if (_incident!.photos.isEmpty)
                                  const Text(
                                    'No photographic evidence attached to this incident.',
                                    style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8), fontStyle: FontStyle.italic),
                                  )
                                else
                                  SizedBox(
                                    height: 120,
                                    child: ListView.builder(
                                      scrollDirection: Axis.horizontal,
                                      itemCount: _incident!.photos.length,
                                      itemBuilder: (ctx, idx) {
                                        final photoUrl = ApiConfig.resolvePhotoUrl(_incident!.photos[idx]);
                                        return Container(
                                          width: 140,
                                          margin: const EdgeInsets.only(right: 12),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFF0F172A),
                                            borderRadius: BorderRadius.circular(8),
                                            border: Border.all(color: const Color(0xFF06B6D4)),
                                          ),
                                          clipBehavior: Clip.antiAlias,
                                          child: Image.network(
                                            photoUrl,
                                            fit: BoxFit.cover,
                                            errorBuilder: (context, error, stackTrace) {
                                              return Center(
                                                child: Column(
                                                  mainAxisAlignment: MainAxisAlignment.center,
                                                  children: [
                                                    const Icon(Icons.broken_image, color: Colors.white60, size: 28),
                                                    const SizedBox(height: 4),
                                                    Text(
                                                      'Evidence ${idx + 1}',
                                                      style: const TextStyle(fontSize: 10, color: Colors.white70),
                                                    ),
                                                  ],
                                                ),
                                              );
                                            },
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Municipal Actions Card (Dispatch & Lifecycle)
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFF6366F1), width: 1.2),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF6366F1).withOpacity(0.06),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Row(
                                  children: [
                                    Icon(Icons.engineering_outlined, size: 18, color: Color(0xFF4F46E5)),
                                    SizedBox(width: 8),
                                    Text(
                                      'MUNICIPAL TRIAGE & ACTIONS',
                                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 14),

                                // State Machine Transition Selector
                                const Text(
                                  'LIFECYCLE STATUS TRANSITION',
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
                                ),
                                const SizedBox(height: 6),
                                DropdownButtonFormField<String>(
                                  value: _selectedNextStatus,
                                  decoration: const InputDecoration(
                                    helperText: 'Enforces state machine: REPORTED ➔ VERIFIED ➔ ASSIGNED ➔ INVESTIGATING ➔ RESOLVED',
                                    helperMaxLines: 2,
                                  ),
                                  items: IncidentConstants.getAllowedNextStatuses(_incident!.status).map((st) {
                                    return DropdownMenuItem(
                                      value: st,
                                      child: Text(
                                        st == _incident!.status ? '$st (Current)' : '→ Transition to $st',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: st == _incident!.status ? FontWeight.bold : FontWeight.normal,
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                  onChanged: (val) {
                                    if (val != null) setState(() => _selectedNextStatus = val);
                                  },
                                ),

                                const SizedBox(height: 16),

                                // Field Worker Assignment
                                const Text(
                                  'ASSIGN FIELD WORKER / CREW',
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
                                ),
                                const SizedBox(height: 6),
                                DropdownButtonFormField<String>(
                                  value: _selectedAssignedTeam,
                                  decoration: const InputDecoration(),
                                  hint: const Text('-- Unassigned --', style: TextStyle(fontSize: 13)),
                                  items: [
                                    const DropdownMenuItem<String>(
                                      value: null,
                                      child: Text('-- Unassigned --', style: TextStyle(fontSize: 13, color: Colors.grey)),
                                    ),
                                    ...IncidentConstants.fieldTeams.map((team) {
                                      return DropdownMenuItem(
                                        value: team,
                                        child: Text(team, style: const TextStyle(fontSize: 12)),
                                      );
                                    }).toList(),
                                  ],
                                  onChanged: (val) {
                                    setState(() => _selectedAssignedTeam = val);
                                  },
                                ),

                                const SizedBox(height: 16),

                                // Municipal Dispatch Notes
                                const Text(
                                  'MUNICIPAL DISPATCH & INVESTIGATION NOTES',
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
                                ),
                                const SizedBox(height: 6),
                                TextFormField(
                                  controller: _notesController,
                                  maxLines: 3,
                                  decoration: const InputDecoration(
                                    hintText: 'Log equipment dispatched, suction pump deployment, on-site findings, or resolution summary...',
                                  ),
                                  style: const TextStyle(fontSize: 12),
                                ),

                                const SizedBox(height: 20),

                                // Save Updates Action Button
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF4F46E5),
                                    ),
                                    onPressed: _isSaving ? null : _saveWorkflowUpdates,
                                    icon: const Icon(Icons.save_outlined),
                                    label: Text(_isSaving ? 'SAVING WORKFLOW...' : 'SAVE WORKFLOW UPDATES'),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 24),
                        ],
                      ),
                    ),
    );
  }
}
