import React, { useEffect, useState } from 'react';
    import { useParams, Link } from 'react-router-dom';
    import { supabase } from '../lib/supabase';
    import { useAuth } from '../hooks/useAuth';
    import MatchList from '../components/MatchList';
    import ParticipantList from '../components/ParticipantList';

    interface Tournament {
      id: string;
      name: string;
      description: string;
      status: 'draft' | 'in_progress' | 'completed';
      created_by: string;
      start_date: string | null;
    }

    interface Participant {
      username: string;
      points: number;
    }

    interface Match {
      id: string;
      player1: string;
      player1_id: string;
      player2: string;
      player2_id: string;
      winner_id: string | null;
      round: number;
      status: 'scheduled' | 'completed';
    }

    export default function TournamentDetails() {
      const { id } = useParams<{ id: string }>();
      const { user } = useAuth();
      const [tournament, setTournament] = useState<Tournament | null>(null);
      const [participants, setParticipants] = useState<Participant[]>([]);
      const [matches, setMatches] = useState<Match[]>([]);
      const [error, setError] = useState('');
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        if (id) {
          fetchTournamentData();
        }
      }, [id]);

      const fetchTournamentData = async () => {
        try {
          setLoading(true);
          const { data: tournamentData, error: tournamentError } = await supabase
            .from('tournaments')
            .select('*')
            .eq('id', id)
            .single();
          if (tournamentError) throw tournamentError;
          setTournament(tournamentData);

          const { data: participantsData, error: participantsError } = await supabase
            .from('tournament_participants')
            .select(`
              points,
              profiles:participant_id (username)
            `)
            .eq('tournament_id', id);
          if (participantsError) throw participantsError;
          setParticipants(participantsData.map(p => ({ username: p.profiles.username, points: p.points })) || []);

          const { data: matchesData, error: matchesError } = await supabase
            .from('matches')
            .select(`
              id,
              round,
              status,
              winner_id,
              player1_id,
              player2_id,
              player1:player1_id(username),
              player2:player2_id(username)
            `)
            .eq('tournament_id', id)
            .order('round', { ascending: true });
          if (matchesError) throw matchesError;
          setMatches(matchesData.map(m => ({ ...m, player1: m.player1.username, player2: m.player2.username })) || []);
        } catch (error: any) {
          setError(error.message);
        } finally {
          setLoading(false);
        }
      };

      const handleStartTournament = async () => {
        try {
          const { error } = await supabase
            .from('tournaments')
            .update({ status: 'in_progress' })
            .eq('id', id);
          if (error) throw error;
          fetchTournamentData();
        } catch (error: any) {
          setError(error.message);
        }
      };

      const handleSetWinner = async (matchId: string, winnerId: string) => {
        try {
          // 1. Update the match with the winner
          const { error: matchError } = await supabase
            .from('matches')
            .update({ winner_id: winnerId, status: 'completed' })
            .eq('id', matchId);
          if (matchError) throw matchError;

          // 2. Increment points for the winner
          const { data: pointsData, error: pointsError } = await supabase.rpc('increment_points', {
            tournament_id_param: id,
            participant_id_param: winnerId,
          });
          if (pointsError) throw pointsError;

          // 3. Check if all matches are completed and update tournament status
          if (await allMatchesCompleted()) {
            await supabase
              .from('tournaments')
              .update({ status: 'completed' })
              .eq('id', id);
          }

          // 4. Fetch updated data
          fetchTournamentData();
        } catch (error: any) {
          setError(error.message);
        }
      };

      const allMatchesCompleted = async () => {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .eq('tournament_id', id)
          .eq('status', 'scheduled');
        if (error) {
          console.error("Error checking matches:", error);
          return false;
        }
        return data.length === 0;
      };

      if (loading) {
        return <div>Loading...</div>;
      }

      if (!tournament) {
        return <div>Tournament not found</div>;
      }

      const isOwner = tournament.created_by === user?.id;

      return (
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{tournament.name}</h1>
            <p className="mt-2 text-gray-600">{tournament.description}</p>
            {tournament.start_date && (
              <p className="mt-2 text-gray-600">Start Date: {new Date(tournament.start_date).toLocaleDateString()}</p>
            )}
            <div className="mt-4">
              <span className={`px-2 py-1 text-sm rounded-full ${
                tournament.status === 'completed' ? 'bg-green-100 text-green-800' :
                  tournament.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
              }`}>
                {tournament.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Matches</h2>
              {(tournament.status === 'in_progress' || tournament.status === 'completed') && (
                <MatchList
                  matches={matches}
                  onSetWinner={isOwner ? handleSetWinner : undefined}
                  readonly={!isOwner}
                />
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Standings</h2>
              <div className="bg-white rounded-lg shadow p-4">
                <ParticipantList
                  participants={participants
                    .sort((a, b) => b.points - a.points)
                    .map(p => `${p.username} (${p.points} points)`)
                  }
                  readonly
                />
              </div>
            </div>
          </div>
          <Link to={`/tournaments/${id}/participants`} className="text-blue-500 hover:underline">Manage Participants</Link>
          {isOwner && tournament.status === 'draft' && (
            <button onClick={handleStartTournament} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
              Start Tournament
            </button>
          )}
        </div>
      );
    }
