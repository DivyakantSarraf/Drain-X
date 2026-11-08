import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../models/incident.dart';
import '../../widgets/incident_card.dart';
import '../../widgets/kpi_card.dart';
import '../../widgets/empty_state_view.dart';
import '../auth/welcome_screen.dart';
import 'municipal_incident_detail_screen.dart';

class MunicipalDashboardScreen extends StatefulWidget {
  final String officerName;

  const MunicipalDashboardScreen({
    Key? key,
    required this.officerName,
  }) : super(key: key);

  @override
  State<MunicipalDashboardScreen> createState() => _MunicipalDashboardScreenState();
}

class _MunicipalDashboardScreenState extends State<MunicipalDashboardScreen> {
  final ApiClient _apiClient = ApiClient();
  List<Incident> _incidents = [];
  bool _isLoading = true;
  String? _errorMessage;

  String _selectedStatusFilter = 'ALL';
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchIncidents();
  }

  Future<void> _fetchIncidents() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final incidents = await _apiClient.getIncidents();
      setState(() {
        _incidents = incidents;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  List<Incident> get _filteredIncidents {
    return _incidents.filterBy(
      status: _selectedStatusFilter,
      query: _searchQuery,
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = _incidents.length;
    final open = _incidents.where((i) => i.status != 'RESOLVED' && i.status != 'REJECTED').length;
    final criticalOrHigh = _incidents.where((i) => (i.severity == 'CRITICAL' || i.severity == 'HIGH') && i.status != 'RESOLVED').length;
    final assigned = _incidents.where((i) => i.assignedTo != null && i.assignedTo!.isNotEmpty && i.status != 'RESOLVED').length;
    final resolved = _incidents.where((i) => i.status == 'RESOLVED').length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Municipal Operations'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Queue',
            onPressed: _fetchIncidents,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () {
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const WelcomeScreen()),
                (route) => false,
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchIncidents,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Officer Identity Banner
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                color: const Color(0xFF1E1B4B),
                child: Row(
                  children: [
                    const Icon(Icons.shield, size: 20, color: Color(0xFF818CF8)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.officerName,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF312E81),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: const Color(0xFF6366F1)),
                      ),
                      child: const Text(
                        'PANAJI BASIN',
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFFA5B4FC)),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 14),

              // KPI Metrics Grid
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: KpiCard(
                            title: 'Total Tickets',
                            value: '$total',
                            icon: Icons.assignment_outlined,
                            accentColor: const Color(0xFF0284C7),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: KpiCard(
                            title: 'Active Open',
                            value: '$open',
                            icon: Icons.hourglass_top,
                            accentColor: const Color(0xFF2563EB),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: KpiCard(
                            title: 'Critical/High',
                            value: '$criticalOrHigh',
                            icon: Icons.warning_amber_rounded,
                            accentColor: AppTheme.severityCritical,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: KpiCard(
                            title: 'Crews Dispatched',
                            value: '$assigned',
                            icon: Icons.groups_outlined,
                            accentColor: const Color(0xFF4F46E5),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: KpiCard(
                            title: 'Resolved',
                            value: '$resolved',
                            icon: Icons.check_circle_outline,
                            accentColor: const Color(0xFF16A34A),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Search Box
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  controller: _searchController,
                  onChanged: (val) {
                    setState(() {
                      _searchQuery = val.trim();
                    });
                  },
                  decoration: InputDecoration(
                    hintText: 'Search ticket ID, description, crew...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _searchQuery = '');
                            },
                          )
                        : null,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  style: const TextStyle(fontSize: 13),
                ),
              ),

              const SizedBox(height: 12),

              // Status Filter Chips
              SizedBox(
                height: 38,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    'ALL',
                    'REPORTED',
                    'VERIFIED',
                    'ASSIGNED',
                    'INVESTIGATING',
                    'RESOLVED',
                  ].map((st) {
                    final isSelected = _selectedStatusFilter == st;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        label: Text(st, style: TextStyle(fontSize: 11, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                        selected: isSelected,
                        selectedColor: const Color(0xFFE0E7FF),
                        checkmarkColor: const Color(0xFF4338CA),
                        backgroundColor: Colors.white,
                        side: BorderSide(color: isSelected ? const Color(0xFF6366F1) : const Color(0xFFCBD5E1)),
                        onSelected: (val) {
                          setState(() {
                            _selectedStatusFilter = st;
                          });
                        },
                      ),
                    );
                  }).toList(),
                ),
              ),

              const SizedBox(height: 12),

              // Queue Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'FIELD INCIDENT QUEUE',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569), letterSpacing: 0.5),
                    ),
                    Text(
                      '${_filteredIncidents.length} shown',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 8),

              // Incident List
              if (_isLoading)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_errorMessage != null)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red))),
                )
              else if (_filteredIncidents.isEmpty)
                const EmptyStateView(
                  icon: Icons.inbox_outlined,
                  title: 'No Matching Tickets',
                  description: 'No municipal incidents found matching the specified filters.',
                )
              else
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _filteredIncidents.length,
                  itemBuilder: (ctx, idx) {
                    final item = _filteredIncidents[idx];
                    return IncidentCard(
                      incident: item,
                      onTap: () async {
                        final updated = await Navigator.push<bool>(
                          context,
                          MaterialPageRoute(
                            builder: (_) => MunicipalIncidentDetailScreen(
                              incidentId: item.id,
                              officerName: widget.officerName,
                            ),
                          ),
                        );
                        if (updated == true) {
                          _fetchIncidents();
                        }
                      },
                    );
                  },
                ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

extension IncidentFilter on List<Incident> {
  List<Incident> filterBy({required String status, required String query}) {
    return where((i) {
      if (status != 'ALL' && i.status != status) return false;
      if (query.isNotEmpty) {
        final q = query.toLowerCase();
        final matchesId = i.id.toLowerCase().contains(q);
        final matchesDesc = i.description.toLowerCase().contains(q);
        final matchesAssigned = (i.assignedTo ?? '').toLowerCase().contains(q);
        if (!matchesId && !matchesDesc && !matchesAssigned) return false;
      }
      return true;
    }).toList();
  }
}
