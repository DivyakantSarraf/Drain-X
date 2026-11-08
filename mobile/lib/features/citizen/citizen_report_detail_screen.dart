import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../models/incident.dart';
import '../../widgets/severity_badge.dart';
import '../../widgets/status_badge.dart';

class CitizenReportDetailScreen extends StatefulWidget {
  final String incidentId;

  const CitizenReportDetailScreen({
    Key? key,
    required this.incidentId,
  }) : super(key: key);

  @override
  State<CitizenReportDetailScreen> createState() => _CitizenReportDetailScreenState();
}

class _CitizenReportDetailScreenState extends State<CitizenReportDetailScreen> {
  final ApiClient _apiClient = ApiClient();
  Incident? _incident;
  bool _isLoading = true;
  String? _errorMessage;

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
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  Widget _buildLifecycleProgress(String currentStatus) {
    final stages = ['REPORTED', 'VERIFIED', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED'];
    final currentIndex = stages.indexOf(currentStatus);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'MUNICIPAL WORKFLOW LIFECYCLE',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF64748B), letterSpacing: 0.5),
          ),
          const SizedBox(height: 14),
          Row(
            children: List.generate(stages.length * 2 - 1, (index) {
              if (index.isOdd) {
                final stageBeforeIndex = index ~/ 2;
                final isPassed = currentIndex > stageBeforeIndex;
                return Expanded(
                  child: Container(
                    height: 2,
                    color: isPassed ? const Color(0xFF16A34A) : const Color(0xFFCBD5E1),
                  ),
                );
              }

              final stageIndex = index ~/ 2;
              final isCompleted = currentIndex >= stageIndex;
              final isCurrent = currentIndex == stageIndex;

              return Column(
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isCurrent
                          ? const Color(0xFF0284C7)
                          : isCompleted
                              ? const Color(0xFF16A34A)
                              : const Color(0xFFE2E8F0),
                      border: Border.all(
                        color: isCurrent ? const Color(0xFF38BDF8) : Colors.transparent,
                        width: 2,
                      ),
                    ),
                    child: Center(
                      child: isCompleted
                          ? const Icon(Icons.check, size: 12, color: Colors.white)
                          : Text(
                              '${stageIndex + 1}',
                              style: const TextStyle(fontSize: 10, color: Color(0xFF64748B), fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    stages[stageIndex].substring(0, 3),
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                      color: isCurrent ? const Color(0xFF0284C7) : const Color(0xFF64748B),
                    ),
                  ),
                ],
              );
            }),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(
        title: Text(_incident != null ? 'Ticket: ${_incident!.id}' : 'Incident Details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Status',
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
                          // Status & Severity Header Card
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.04),
                                  blurRadius: 6,
                                  offset: const Offset(0, 2),
                                ),
                              ],
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
                                const SizedBox(height: 12),
                                Text(
                                  IncidentConstants.formatCategory(_incident!.category),
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Reported by ${_incident!.reporterName ?? 'Citizen Anonymous'} • ${dateFormat.format(_incident!.createdAt.toLocal())}',
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Lifecycle Progress
                          _buildLifecycleProgress(_incident!.status),

                          const SizedBox(height: 16),

                          // Description Card
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
                                  'CITIZEN OBSERVATIONS',
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

                          // Photographic Evidence Card
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
                                      '${_incident!.photos.length} image(s)',
                                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                if (_incident!.photos.isEmpty)
                                  const Text(
                                    'No photographic evidence attached to this report.',
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
                                                      'Photo ${idx + 1}',
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

                          // Municipal Field Response Card
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
                                  'MUNICIPAL FIELD RESPONSE',
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Icon(Icons.groups_outlined, size: 18, color: Color(0xFF4F46E5)),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text('Assigned Crew:', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                                          Text(
                                            _incident!.assignedTo ?? 'Awaiting municipal assignment',
                                            style: TextStyle(
                                              fontSize: 13,
                                              fontWeight: FontWeight.bold,
                                              color: _incident!.assignedTo != null ? const Color(0xFF4F46E5) : const Color(0xFF94A3B8),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Icon(Icons.note_alt_outlined, size: 18, color: Color(0xFF059669)),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text('Municipal Notes:', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                                          Text(
                                            (_incident!.municipalNotes?.trim().isNotEmpty ?? false)
                                                ? _incident!.municipalNotes!
                                                : 'No municipal notes logged yet.',
                                            style: const TextStyle(fontSize: 12, color: Color(0xFF1E293B)),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
    );
  }
}
